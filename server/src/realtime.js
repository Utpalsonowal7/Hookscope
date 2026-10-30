import { Server } from 'socket.io';
import { readCookie, sessionExpiry } from './security.js';
export function attachRealtime(server,config) {
  const io=new Server(server,{maxHttpBufferSize:8192,
    allowRequest:(req,done)=>done(null,req.headers.origin===config.origin),
    cors:{origin:config.origin,credentials:true}});
  io.use((socket,next)=>{
    const expires=sessionExpiry(readCookie(socket.request.headers.cookie),config.sessionSecret);
    if(!expires)return next(new Error('Authentication required'));
    socket.data.expires=expires; next();
  });
  io.on('connection',socket=>{
    socket.join('workspace');
    const timer=setTimeout(()=>socket.disconnect(true),Math.max(0,socket.data.expires-Date.now()));
    socket.on('disconnect',()=>clearTimeout(timer));
  });
  return io;
}
