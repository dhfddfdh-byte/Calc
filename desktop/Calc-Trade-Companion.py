"""Calc Trade Companion: read-only monitoring of an authorized JSON listing feed."""
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import json, math, time, threading, queue, webbrowser, urllib.request, urllib.parse
from datetime import datetime
from collections import Counter
from pathlib import Path

SITES={"elve":"https://elvebredd.com/trade-center","amvgg":"https://amvgg.com/trades"}

def timestamp(x):
    try:
        t=datetime.fromisoformat(str(x).replace("Z","+00:00"))
        return t.timestamp() if t.tzinfo else float("nan")
    except (ValueError, TypeError, OverflowError): return float("nan")

def key(p):
    n=p.get("name",p.get("n"));g=p.get("type","reg")
    f=p.get("fly",p.get("f_st",False));r=p.get("ride",p.get("r_st",False))
    if not isinstance(n,str) or not n.strip() or g not in ("reg","neon","mega") or type(f) is not bool or type(r) is not bool: raise ValueError("Invalid pet")
    return (" ".join(n.casefold().split()),g,f,r)

def owned(data):
    locked={str(x).casefold() for x in data.get("lockedPets",[])}
    out=Counter();ids=set()
    for p in data.get("inventory",data.get("inv",[])):
        k=key(p);i=p.get("id",p.get("uid"))
        if i is None or str(i) in ids: raise ValueError("Invalid inventory IDs")
        ids.add(str(i))
        if not (p.get("locked") or p.get("reserved") or k[0] in locked):out[k]+=1
    return out

def scan(payload,inv,profit=10,loss=.5,floor=4,now=None):
    now=time.time() if now is None else now
    if not (5<=profit<=10000 and 0<=loss<=1 and 0<=floor<=10):raise ValueError("Invalid settings")
    rows=payload.get("listings")
    if not isinstance(rows,list) or len(rows)>5000:raise ValueError("Invalid listing feed")
    def metrics(items):
        if not 1<=len(items)<=18:raise ValueError("Invalid bundle")
        out=[]
        for p in items:
            key(p);v=p.get("value");d=p.get("demand");u=p.get("unit")
            if type(v) not in (int,float) or type(d) not in (int,float) or not math.isfinite(v) or not math.isfinite(d) or v<=0 or not 0<=d<=10 or not isinstance(u,str) or not u or not 0<=now-timestamp(p.get("valuedAt"))<=604800:raise ValueError("Unverified metrics")
            out.append((v,d,u))
        return out
    result=[];seen=set()
    for t in rows:
        try:
            source=t["source"];ident=t["id"]
            if source not in SITES or not isinstance(ident,str) or not ident or (source,ident) in seen or t.get("status")!="active" or not 0<=now-timestamp(t.get("verifiedAt"))<=300:continue
            if t.get("expiresAt") is not None and not timestamp(t["expiresAt"])>now:continue
            give=t["requesting"];receive=t["offering"]
            if Counter(map(key,give))-inv:continue
            a,b=metrics(give),metrics(receive)
            if len({x[2] for x in a+b})!=1:continue
            av=sum(x[0] for x in a);bv=sum(x[0] for x in b);win=100*(bv-av)/av
            da=sum(x[0]*x[1] for x in a)/av;db=sum(x[0]*x[1] for x in b)/bv
            if win+1e-9<profit or da-db>loss+1e-9 or any(x[1]<floor for x in b):continue
            seen.add((source,ident));result.append((t,win,da-db))
        except (ValueError,TypeError,KeyError,AttributeError,ZeroDivisionError):continue
    return sorted(result,key=lambda x:-x[1])

def fetch(url):
    u=urllib.parse.urlsplit(url)
    if u.scheme!="https" or not u.hostname or u.username or u.password:raise ValueError("Authorized HTTPS feed required")
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*a,**kw):return None
    req=urllib.request.Request(url,headers={"User-Agent":"CalcCompanion/1.0","Accept":"application/json"})
    with urllib.request.build_opener(NoRedirect()).open(req,timeout=20) as r:
        if r.headers.get_content_type()!="application/json":raise ValueError("Expected JSON feed, not a webpage")
        raw=r.read(8*1024*1024+1)
    if len(raw)>8*1024*1024:raise ValueError("Feed too large")
    return json.loads(raw)

def main():
    root=tk.Tk();root.title("Calc Trade Companion");root.geometry("850x580")
    frame=ttk.Frame(root,padding=16);frame.pack(fill="both",expand=True)
    ttk.Label(frame,text="Trade Companion",font=("Segoe UI",20,"bold")).pack(anchor="w")
    ttk.Label(frame,text="Read-only monitoring. Review offers on the provider website.").pack(anchor="w")
    status=tk.StringVar(value="Import an inventory exported from Calc. No live feed is configured.")
    url=tk.StringVar();profit=tk.StringVar(value="10");loss=tk.StringVar(value="0.5");floor=tk.StringVar(value="4")
    inv=Counter();results=[];seen=set();q=queue.Queue();running=False;generation=0;busy=False;timer=None
    def load():
        nonlocal inv,generation
        path=filedialog.askopenfilename(filetypes=[("Inventory JSON","*.json")])
        if not path:return
        try:
            inv=owned(json.loads(Path(path).read_text(encoding="utf-8-sig")));generation+=1;clear();status.set(f"{sum(inv.values())} eligible pets")
        except Exception as e:messagebox.showerror("Import failed",str(e))
    ttk.Button(frame,text="Import Calc inventory",command=load).pack(anchor="w",pady=8)
    ttk.Label(frame,text="Authorized listing feed URL").pack(anchor="w");ttk.Entry(frame,textvariable=url).pack(fill="x")
    opts=ttk.Frame(frame);opts.pack(fill="x",pady=8)
    for label,var in [("Min profit %",profit),("Max demand loss",loss),("Min demand",floor)]:
        ttk.Label(opts,text=label).pack(side="left");ttk.Entry(opts,width=7,textvariable=var).pack(side="left",padx=6)
    buttons=ttk.Frame(frame);buttons.pack(fill="x")
    tree=ttk.Treeview(frame,columns=("source","profit","loss","give","receive"),show="headings")
    for c,title,w in [("source","Site",70),("profit","Profit",80),("loss","Demand loss",100),("give","You give",240),("receive","You receive",240)]:
        tree.heading(c,text=title);tree.column(c,width=w)
    tree.pack(fill="both",expand=True,pady=8)
    def clear():
        results.clear();tree.delete(*tree.get_children())
    def label(p):
        n,g,f,r=key(p);return str(p.get("name",p.get("n")))+(" N" if g=="neon" else " M" if g=="mega" else "")+(" F" if f else "")+(" R" if r else "")
    def display(matches):
        clear();results.extend(matches);fresh=False
        for i,(t,w,d) in enumerate(matches):
            tree.insert("","end",iid=str(i),values=(t["source"],f"{w:+.1f}%",f"{d:+.2f}",", ".join(map(label,t["requesting"])),", ".join(map(label,t["offering"]))))
            k=(t["source"],t["id"]);fresh|=k not in seen;seen.add(k)
        if fresh:root.bell()
        status.set(f"{len(matches)} qualifying offers. {datetime.now():%H:%M:%S}")
    def refresh():
        nonlocal busy
        if busy:return
        try:
            params=(float(profit.get()),float(loss.get()),float(floor.get()));scan({"listings":[]},inv,*params)
            if not inv:raise ValueError("Import inventory first")
            feed=url.get().strip();snapshot=inv.copy();g=generation;busy=True
            def worker():
                try:q.put((g,scan(fetch(feed),snapshot,*params),None))
                except Exception as e:q.put((g,None,str(e)))
            threading.Thread(target=worker,daemon=True).start();status.set("Checking feed...")
        except Exception as e:status.set(str(e))
    def poll():
        nonlocal timer
        if running:refresh();timer=root.after(300000,poll)
    def start():
        nonlocal running
        if not running:running=True;poll()
    def stop():
        nonlocal running,generation,timer
        running=False;generation+=1
        if timer is not None:root.after_cancel(timer);timer=None
    def check():
        nonlocal busy
        try:
            while True:
                g,m,e=q.get_nowait();busy=False
                if g!=generation:continue
                if e:clear();stop();status.set("Feed unavailable; paused. "+e)
                else:display(m)
        except queue.Empty:pass
        if any(not 0<=time.time()-timestamp(t["verifiedAt"])<=300 or (t.get("expiresAt") is not None and timestamp(t["expiresAt"])<=time.time()) for t,_,_ in results):
            display([x for x in results if 0<=time.time()-timestamp(x[0]["verifiedAt"])<=300 and (x[0].get("expiresAt") is None or timestamp(x[0]["expiresAt"])>time.time())])
        root.after(1000,check)
    def review():
        sel=tree.selection()
        if not sel:return
        t,_,_=results[int(sel[0])]
        if not 0<=time.time()-timestamp(t["verifiedAt"])<=300 or (t.get("expiresAt") is not None and timestamp(t["expiresAt"])<=time.time()):clear();return
        webbrowser.open(SITES[t["source"]])
    for title,cmd in [("Check now",refresh),("Start monitoring",start),("Stop",stop),("Review on website",review)]:ttk.Button(buttons,text=title,command=cmd).pack(side="left",padx=3)
    ttk.Label(frame,textvariable=status,wraplength=790).pack(anchor="w");check();root.mainloop()

if __name__=="__main__":main()
