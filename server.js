const express=require("express");const http=require("http");const WebSocket=require("ws");const crypto=require("crypto");const path=require("path");
const app=express(),server=http.createServer(app),wss=new WebSocket.Server({server,path:"/ws"});const PORT=process.env.PORT||3000,rooms=new Map();
app.disable("x-powered-by");app.use(express.static(path.join(__dirname,"public")));app.get("/healthz",(q,r)=>r.json({ok:true,service:"XITERZ VOICE V2",rooms:rooms.size}));app.get("*",(q,r)=>r.sendFile(path.join(__dirname,"public","index.html")));
const send=(w,x)=>w.readyState===WebSocket.OPEN&&w.send(JSON.stringify(x));
function broadcast(room,x,skip){for(const [id,m] of room.members)if(id!==skip)send(m.ws,x)}
function name(x){return String(x||"Guest").replace(/[<>]/g,"").trim().slice(0,20)||"Guest"}
function code(x){return String(x||"").toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,24)}
function leave(ws){if(!ws.room||!rooms.has(ws.room))return;const r=rooms.get(ws.room);r.members.delete(ws.id);broadcast(r,{type:"member-left",id:ws.id});if(!r.members.size)rooms.delete(ws.room);ws.room=null}
wss.on("connection",ws=>{ws.id=crypto.randomBytes(5).toString("hex");ws.room=null;
ws.on("message",raw=>{let m;try{m=JSON.parse(raw)}catch{return send(ws,{type:"error",message:"Data tidak valid."})}
if(m.type==="join"){leave(ws);let c=code(m.room);if(!c)return send(ws,{type:"error",message:"Kode room tidak valid."});let r=rooms.get(c);if(!r){r={members:new Map};rooms.set(c,r)}if(r.members.size>=6)return send(ws,{type:"error",message:"Room penuh. Maksimal 6 orang."});
const old=[...r.members.values()].map(x=>({id:x.id,name:x.name,muted:x.muted}));ws.room=c;ws.name=name(m.name);ws.muted=false;r.members.set(ws.id,ws);send(ws,{type:"joined",id:ws.id,room:c,members:old});broadcast(r,{type:"member-joined",id:ws.id,name:ws.name,muted:false},ws.id);return}
if(!ws.room||!rooms.has(ws.room))return;const r=rooms.get(ws.room);
if(["offer","answer","ice"].includes(m.type)){const t=r.members.get(m.target);if(t)send(t.ws,{...m,from:ws.id})}
else if(m.type==="state"){ws.muted=!!m.muted;broadcast(r,{type:"member-state",id:ws.id,name:ws.name,muted:ws.muted})}
else if(m.type==="speaking")broadcast(r,{type:"speaking",id:ws.id,value:!!m.value},ws.id);
else if(m.type==="leave")leave(ws)});
ws.on("close",()=>leave(ws));ws.on("error",()=>leave(ws))});
server.listen(PORT,"0.0.0.0",()=>console.log("XITERZ VOICE V2 listening on "+PORT));