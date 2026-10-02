const $=s=>document.querySelector(s);

let ws,stream,myId,roomCode,muted=false,iceServers=[];
const peers=new Map();
const pendingIce=new Map();

function status(on){
  $("#status").className=on?"online":"";
  $("#status").textContent=on?"● SERVER ONLINE":"● SERVER OFFLINE";
}
function setConn(t){$("#conn").textContent=t;}
function send(x){
  if(ws&&ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(x));
}
function esc(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function draw(id,name,speaking=false,m=false){
  let e=document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if(!e){e=document.createElement("div");e.className="member";e.dataset.id=id;$("#list").appendChild(e);}
  e.classList.toggle("speaking",speaking);
  e.innerHTML=`<div class="avatar">${esc(name[0]||"?").toUpperCase()}</div>
  <div><div class="memberName">${esc(name)}${id===myId?" (YOU)":""}</div>
  <div class="memberState">${speaking?"SPEAKING...":"CONNECTED"}</div></div>
  <div class="mic">${m?"MUTED":"MIC"}</div>`;
  $("#count").textContent=`${$("#list").children.length}/6`;
}
function remove(id){
  document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove();
  const p=peers.get(id); if(p)p.close();
  peers.delete(id); pendingIce.delete(id);
  document.querySelectorAll(`audio[data-peer="${CSS.escape(id)}"]`).forEach(a=>a.remove());
  $("#count").textContent=`${$("#list").children.length}/6`;
}
async function getRtcConfig(){
  try{
    const r=await fetch("/rtc-config",{cache:"no-store"});
    const data=await r.json();
    iceServers=data.iceServers||[{urls:"stun:stun.l.google.com:19302"}];
  }catch{
    iceServers=[{urls:"stun:stun.l.google.com:19302"}];
  }
}
async function flushIce(id,p){
  const q=pendingIce.get(id)||[];
  pendingIce.delete(id);
  for(const c of q){
    try{await p.addIceCandidate(c);}catch{}
  }
}
function addRemoteAudio(id,stream){
  let a=document.querySelector(`audio[data-peer="${CSS.escape(id)}"]`);
  if(!a){
    a=document.createElement("audio");
    a.autoplay=true;
    a.playsInline=true;
    a.setAttribute("playsinline","");
    a.dataset.peer=id;
    document.body.appendChild(a);
  }
  a.srcObject=stream;
  const play=a.play();
  if(play) play.catch(()=>showAudioUnlock());
}
function showAudioUnlock(){
  $("#audioUnlock").classList.remove("hidden");
}
async function unlockAudio(){
  const audios=[...document.querySelectorAll("audio[data-peer]")];
  for(const a of audios){try{await a.play();}catch{}}
  $("#audioUnlock").classList.add("hidden");
}
async function makePeer(id,offer){
  if(peers.has(id))return peers.get(id);
  const p=new RTCPeerConnection({iceServers});
  peers.set(id,p);
  pendingIce.set(id,[]);
  stream.getTracks().forEach(t=>p.addTrack(t,stream));
  p.onicecandidate=e=>{
    if(e.candidate)send({type:"ice",target:id,candidate:e.candidate});
  };
  p.ontrack=e=>{
    if(e.streams[0])addRemoteAudio(id,e.streams[0]);
  };
  p.onconnectionstatechange=()=>{
    const s=p.connectionState;
    if(s==="connected"){draw(id,document.querySelector(`[data-id="${CSS.escape(id)}"] .memberName`)?.textContent?.replace(" (YOU)","")||"Guest");setConn("CONNECTED");}
    if(["failed","closed"].includes(s))remove(id);
  };
  p.oniceconnectionstatechange=()=>{
    if(p.iceConnectionState==="failed")setConn("ICE FAILED — coba refresh");
  };
  if(offer){
    const o=await p.createOffer();
    await p.setLocalDescription(o);
    send({type:"offer",target:id,offer:p.localDescription});
  }
  return p;
}
async function join(){
  const n=$("#name").value.trim();
  const r=$("#room").value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"");
  $("#error").textContent="";
  if(!n||!r)return $("#error").textContent="Username dan room code wajib diisi.";
  try{
    setConn("CONNECTING");
    await getRtcConfig();
    stream=await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}
    });
    ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host+"/ws");
    ws.onopen=()=>{status(true);setConn("SIGNALING OK");send({type:"join",name:n,room:r});};
    ws.onclose=()=>{status(false);setConn("SERVER OFFLINE");};
    ws.onerror=()=>{$("#error").textContent="WebSocket gagal terhubung.";};
    ws.onmessage=async e=>{
      const m=JSON.parse(e.data);
      try{
        if(m.type==="error"){return $("#error").textContent=m.message;}
        if(m.type==="joined"){
          myId=m.id;roomCode=m.room;
          $("#landing").classList.add("hidden");
          $("#roomView").classList.remove("hidden");
          $("#roomName").textContent=roomCode;
          $("#roomCode").textContent=roomCode;
          draw(myId,n,false,muted);
          m.members.forEach(x=>draw(x.id,x.name,false,x.muted));
          for(const x of m.members)await makePeer(x.id,true);
          setConn(m.members.length?"NEGOTIATING":"WAITING FOR MEMBER");
          return;
        }
        if(m.type==="member-joined"){draw(m.id,m.name);setConn("NEW MEMBER");return;}
        if(m.type==="member-left"){remove(m.id);return;}
        if(m.type==="offer"){
          const p=await makePeer(m.from,false);
          await p.setRemoteDescription(new RTCSessionDescription(m.offer));
          await flushIce(m.from,p);
          const a=await p.createAnswer();
          await p.setLocalDescription(a);
          send({type:"answer",target:m.from,answer:p.localDescription});
          return;
        }
        if(m.type==="answer"){
          const p=peers.get(m.from);
          if(p){
            await p.setRemoteDescription(new RTCSessionDescription(m.answer));
            await flushIce(m.from,p);
          }
          return;
        }
        if(m.type==="ice"){
          const p=peers.get(m.from);
          if(!p||!p.remoteDescription){
            if(!pendingIce.has(m.from))pendingIce.set(m.from,[]);
            pendingIce.get(m.from).push(m.candidate);
          }else{
            try{await p.addIceCandidate(m.candidate);}catch{}
          }
          return;
        }
        if(m.type==="member-state"){draw(m.id,m.name,false,m.muted);return;}
        if(m.type==="speaking"){
          const e2=document.querySelector(`[data-id="${CSS.escape(m.id)}"]`);
          if(e2)e2.classList.toggle("speaking",m.value);
        }
      }catch(err){
        console.error(err);
        $("#error").textContent="WebRTC error: "+err.message;
      }
    };
  }catch(e){
    $("#error").textContent=e.message||"Gagal mengakses mic.";
    setConn("ERROR");
  }
}

$("#join").onclick=join;
$("#random").onclick=()=>$("#room").value="X"+Math.random().toString(36).slice(2,8).toUpperCase();
$("#copy").onclick=async()=>{
  await navigator.clipboard?.writeText(roomCode);
  $("#message").textContent="Kode room disalin.";
};
$("#mute").onclick=()=>{
  muted=!muted;
  stream?.getAudioTracks().forEach(t=>t.enabled=!muted);
  $("#mute").innerHTML=`MIC <b>${muted?"OFF":"ON"}</b>`;
  draw(myId,$("#name").value.trim(),false,muted);
  send({type:"state",muted});
};
$("#leave").onclick=()=>{send({type:"leave"});location.reload();};
$("#audioUnlock").onclick=unlockAudio;
status(false);
