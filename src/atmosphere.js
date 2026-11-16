// Decorative grains stay behind the library and never capture pointer input.
export function createAtmosphere({document,window}){
 let frame=0,last=0,grains=[],width=0,height=0,enabled=false;
 const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 const canvas=document.getElementById('sand-atmosphere');
 const context=canvas?.getContext('2d');
 function stop(){if(frame)window.cancelAnimationFrame(frame);frame=0;last=0;if(context)context.clearRect(0,0,width,height);}
 function resize(){if(!canvas||!context)return;const dpr=Math.min(window.devicePixelRatio||1,1.5);width=window.innerWidth;height=window.innerHeight;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);grains=Array.from({length:width<600?24:52},()=>({x:Math.random()*width,y:Math.random()*height,r:.35+Math.random()*.65,speed:7+Math.random()*16,alpha:.05+Math.random()*.16,phase:Math.random()*6.28}));}
 function canRun(){return enabled&&!motion.matches&&!document.hidden&&!document.getElementById('reader')?.open;}
 function tick(now){frame=0;if(!canRun()){stop();return;}if(last&&now-last<40){frame=window.requestAnimationFrame(tick);return;}const dt=last?Math.min((now-last)/1000,.1):0;last=now;context.clearRect(0,0,width,height);for(const p of grains){p.x+=p.speed*dt;p.y-=dt*2;p.y+=Math.sin(now/6000+p.phase)*dt*3;if(p.x>width+2)p.x=-2;if(p.y<-2)p.y=height+2;context.beginPath();context.fillStyle=`rgba(226,183,115,${p.alpha})`;context.ellipse(p.x,p.y,p.r*1.7,p.r, -.2,0,Math.PI*2);context.fill();}frame=window.requestAnimationFrame(tick);}
 function sync(){stop();if(canRun()&&context){if(!grains.length)resize();frame=window.requestAnimationFrame(tick);}}
 motion.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);window.addEventListener('resize',()=>{if(enabled){resize();sync();}});
 document.getElementById('reader')?.addEventListener('close',sync);
 // Dialog state changes include programmatic showModal().
 if(window.MutationObserver&&document.getElementById('reader'))new window.MutationObserver(sync).observe(document.getElementById('reader'),{attributes:true,attributeFilter:['open']});
 return {set(value){if(value===enabled)return;enabled=value;canvas.hidden=!enabled;sync();}};
}
