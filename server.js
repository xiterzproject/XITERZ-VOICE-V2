const express=require("express");
const http=require("http");
const WebSocket=require("ws");
const crypto=require("crypto");
const path=require("path");

const app=express();
const server=http.createServer(app);
const wss=new WebSocket.Server({server,path:"/ws"});
const PORT=process.env.PORT||3000;
const rooms=new Map();

app.disable("x-powered-by");
app.use(express.static(path.join(__dirname,"public")));
app.get("/healthz",(q,r)=>r.json({ok:true,service:"XITERZ VOICE V2 DEBUG",rooms:rooms.size,clients:wss.clients.size}));
app.get("/rtc-config",(q,r)=>{
  const ice=[{urls:"stun:stun.l.google.com:19302"}];
  if(process.env.TURN_URL&&process.env.TURN_USERNAME&&process.env.TURN_CREDENTIAL){
    ice.push({urls:process.env.TURN_URL.split(",").map(x=>x.trim()).filter(Boolean),username:process.env.TURN_USERNAME,credential:process.env.TURN_CREDENTIAL});
  }
  console.log(`[RTC-CONFIG] STUN + ${ice.length-1} TURN server(s)`);
  r.json({iceServers:ice});
});
app.get("*",(q,r)=>r.sendFile(path.join(__dirname,"public","index.html")));

const send=(ws,msg)=>{
  if(ws.readyState===WebSocket.OPEN){ws.send(JSON.stringify(msg));return true;}
  console.log(`[WS SEND SKIP] id=${ws.id||"?"} state=${ws.readyState}`);return false;
};
const log=(...a)=>console.log(new Date().toISOString(),...a);
const cleanName=x=>String(x||"Guest").replace(/[<>]/g,"").trim().slice(0,20)||"Guest";
const cleanCode=x=>String(x||"").toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,24);
function roomInfo(r){return [...r.members.values()].map(x=>`${x.id}:${x.name}`).join(", ")||"empty";}
function broadcast(room,msg,skip){for(const [id,m] of room.members)if(id!==skip)send(m,msg);}
function leave(ws,reason="leave"){
  if(!ws.room||!rooms.has(ws.room))return;
  const r=rooms.get(ws.room);
  const room=ws.room;
  r.members.delete(ws.id);
  log(`[ROOM LEAVE] room=${room} id=${ws.id} reason=${reason} members=${r.members.size}`);
  broadcast(r,{type:"member-left",id:ws.id});
  if(!r.members.size){rooms.delete(room);log(`[ROOM DELETE] room=${room}`);}
  ws.room=null;
}

wss.on("connection",(ws,req)=>{
  ws.id=crypto.randomBytes(5).toString("hex");
  ws.room=null;ws.name="Guest";ws.isAlive=true;
  const ip=req.headers["x-forwarded-for"]||req.socket.remoteAddress||"unknown";
  log(`[WS CONNECT] id=${ws.id} ip=${ip} path=${req.url}`);
  ws.on("pong",()=>{ws.isAlive=true;});
  ws.on("message",raw=>{
    log(`[WS MESSAGE] id=${ws.id} room=${ws.room||"-"} bytes=${raw.length}`);
    let m;try{m=JSON.parse(raw)}catch(e){log(`[WS JSON ERROR] id=${ws.id}`);return send(ws,{type:"error",message:"Data tidak valid."});}
    log(`[SIGNAL] id=${ws.id} type=${m.type}${m.target?` target=${m.target}`:""}`);
    if(m.type==="join"){
      leave(ws,"rejoin");
      const c=cleanCode(m.room);
      if(!c)return send(ws,{type:"error",message:"Kode room tidak valid."});
      let r=rooms.get(c);
      if(!r){r={members:new Map()};rooms.set(c,r);log(`[ROOM CREATE] room=${c}`);}
      if(r.members.size>=6)return send(ws,{type:"error",message:"Room penuh. Maksimal 6 orang."});
      const old=[...r.members.values()].map(x=>({id:x.id,name:x.name,muted:x.muted}));
      ws.room=c;ws.name=cleanName(m.name);ws.muted=false;r.members.set(ws.id,ws);
      log(`[ROOM JOIN] room=${c} id=${ws.id} name=${ws.name} oldMembers=${old.length} members=${roomInfo(r)}`);
      send(ws,{type:"joined",id:ws.id,room:c,members:old});
      broadcast(r,{type:"member-joined",id:ws.id,name:ws.name,muted:false},ws.id);
      return;
    }
    if(!ws.room||!rooms.has(ws.room)){log(`[WS IGNORE] id=${ws.id} no room type=${m.type}`);return;}
    const r=rooms.get(ws.room);
    if(["offer","answer","ice"].includes(m.type)){
      const t=r.members.get(m.target);
      if(t){log(`[SIGNAL FORWARD] ${m.type} from=${ws.id} to=${m.target} room=${ws.room}`);send(t,{...m,from:ws.id});}
      else log(`[SIGNAL TARGET MISSING] ${m.type} from=${ws.id} target=${m.target} room=${ws.room}`);
    }else if(m.type==="state"){
      ws.muted=!!m.muted;log(`[STATE] id=${ws.id} muted=${ws.muted}`);broadcast(r,{type:"member-state",id:ws.id,name:ws.name,muted:ws.muted});
    }else if(m.type==="speaking"){
      broadcast(r,{type:"speaking",id:ws.id,value:!!m.value},ws.id);
    }else if(m.type==="leave")leave(ws,"client-leave");
  });
  ws.on("close",(code,reason)=>{log(`[WS CLOSE] id=${ws.id} code=${code} reason=${reason?.toString()||""}`);leave(ws,"socket-close");});
  ws.on("error",err=>{log(`[WS ERROR] id=${ws.id} ${err?.stack||err}`);leave(ws,"socket-error");});
});

const heartbeat=setInterval(()=>{
  for(const ws of wss.clients){
    if(ws.isAlive===false){log(`[WS TERMINATE] id=${ws.id} heartbeat timeout`);ws.terminate();continue;}
    ws.isAlive=false;ws.ping();
  }
},25000);
wss.on("close",()=>clearInterval(heartbeat));
server.on("error",err=>log(`[SERVER ERROR] ${err.stack||err}`));
server.listen(PORT,"0.0.0.0",()=>log(`XITERZ VOICE listening on ${PORT}`));
process.on("uncaughtException",err=>log(`[UNCAUGHT] ${err.stack||err}`));
process.on("unhandledRejection",err=>log(`[UNHANDLED] ${err?.stack||err}`));
