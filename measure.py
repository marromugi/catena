import sys, zlib, struct
from collections import Counter
def load(p):
    d=open(p,'rb').read(); i=8; idat=b''
    while i<len(d):
        n,=struct.unpack('>I',d[i:i+4]); t=d[i+4:i+8]; c=d[i+8:i+8+n]; i+=12+n
        if t==b'IHDR': w,h,bd,ct=struct.unpack('>IIBB',c[:10])
        elif t==b'IDAT': idat+=c
    bpp={2:3,6:4}[ct]; raw=zlib.decompress(idat); s=w*bpp; rows=[]; prev=bytearray(s); o=0
    for y in range(h):
        f=raw[o]; o+=1; line=bytearray(raw[o:o+s]); o+=s
        for x in range(s):
            a=line[x-bpp] if x>=bpp else 0; b=prev[x]; cc=prev[x-bpp] if x>=bpp else 0
            if f==1: line[x]=(line[x]+a)&255
            elif f==2: line[x]=(line[x]+b)&255
            elif f==3: line[x]=(line[x]+(a+b)//2)&255
            elif f==4:
                pp=a+b-cc; pa,pb,pc=abs(pp-a),abs(pp-b),abs(pp-cc)
                line[x]=(line[x]+(a if pa<=pb and pa<=pc else b if pb<=pc else cc))&255
        rows.append(line); prev=line
    return w,h,bpp,rows
def px(r,x,bpp): return tuple(r[x*bpp:x*bpp+3])
def measure(p, region):
    w,h,bpp,rows=load(p); x0,y0,x1,y1=region if region else (0,0,w,h)
    cnt=Counter(px(rows[y],x,bpp) for y in range(y0,y1) for x in range(x0,x1))
    canvas=cnt.most_common(1)[0][0]
    grey=[c for c in cnt if c[0]==c[1]==c[2] and c[0]<canvas[0]]
    darkest=min(grey)
    # dot coverage per pixel, from the canvas/dot mix
    cov=lambda c:(canvas[0]-c[0])/(canvas[0]-darkest[0])
    colsum=[sum(cov(px(rows[y],x,bpp)) for y in range(y0,y1) if px(rows[y],x,bpp)[0]<canvas[0] and px(rows[y],x,bpp)[0]>=darkest[0]) for x in range(x0,x1)]
    rowsum=[sum(cov(px(rows[y],x,bpp)) for x in range(x0,x1) if px(rows[y],x,bpp)[0]<canvas[0] and px(rows[y],x,bpp)[0]>=darkest[0]) for y in range(y0,y1)]
    def centres(sums,start):
        out=[];run=[]
        for i,v in enumerate(sums+[0]):
            if v>0: run.append((i,v))
            elif run:
                t=sum(v for _,v in run); out.append(start+sum(i*v for i,v in run)/t); run=[]
        return out
    cx=centres(colsum,x0); cy=centres(rowsum,y0)
    pitch=lambda c:[round(b-a,2) for a,b in zip(c,c[1:])]
    total=sum(colsum); ndots=len(cx)*len(cy)
    area=total/ndots/4  # 1x px^2 at 2x scale
    print(f"{p}: {w}x{h}, region {x0},{y0}-{x1},{y1}")
    print(f"  canvas #{bytes(canvas).hex()} ({cnt[canvas]} px), darkest dot pixel #{bytes(darkest).hex()}")
    print(f"  dot columns {len(cx)}, pitch at 2x: {sorted(set(pitch(cx)))}; dot rows {len(cy)}, pitch at 2x: {sorted(set(pitch(cy)))}")
    print(f"  first dot centre at 2x ({cx[0]:.2f}, {cy[0]:.2f}); dot area at 1x {area:.2f} px^2 -> radius {(area/3.14159)**0.5:.2f}")
if __name__=="__main__":
  reg=tuple(map(int,sys.argv[2].split(','))) if len(sys.argv)>2 else None
  measure(sys.argv[1],reg)
