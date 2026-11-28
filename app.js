
/* ---------------------------------------------------------------- screen sweep */
(function(){
  var s=document.createElement('div');
  s.className='screen-sweep'; s.setAttribute('aria-hidden','true');
  document.body.appendChild(s);
  setTimeout(function(){ s.remove(); }, 1200);
})();

/* ---------------------------------------------------------------- reading position + progress */
(function(){
  var prose=document.querySelector('.prose');
  if(!prose) return;
  var book=document.body.getAttribute('data-book')||'book';
  var ch=(document.querySelector('.bm-btn')||{}).dataset && document.querySelector('.bm-btn').dataset.ch;
  if(!ch) return;

  var bar=document.createElement('div');
  bar.className='progbar'; document.body.appendChild(bar);

  var KEY='th-pos-'+book;
  var store={};
  try{ store=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}

  var lastSave=0;
  // `total` is a property of the document, not of the scroll position, so measure
  // it once per frame at most instead of per scroll event. Reading it inside the
  // handler meant a getBoundingClientRect() on a 13,000px element on every scroll
  // event, which forces layout: measured 245 style recalcs and 85 layouts across
  // 80 frames of scrolling, and the page ran at 34-42ms/frame on a throttled CPU.
  var total=-1;
  function measure(){
    var r=prose.getBoundingClientRect();
    total=r.height-window.innerHeight;
    return -r.top;
  }

  // `save` must not touch layout. It receives the values the scroll handler has
  // already measured, and only writes when the position actually changed and the
  // 600ms gate has elapsed - localStorage.setItem is synchronous and serialising
  // the whole store on every scroll event was costing more than the paint.
  function save(top, height){
    var now=Date.now();
    var pct=height>0?Math.min(1,Math.max(0,top/height)):0;
    var last=store[ch];
    if(last && Math.abs((last.p||0)-window.scrollY)<40 && Math.abs((last.t||0)-Math.round(pct*100))<1) return;
    if(now-lastSave<600) return;
    lastSave=now;
    // Opening a chapter and leaving without reading must not erase progress.
    // The in-memory `store` was parsed at page load, so read the live value:
    // a beforeunload at scrollY 0 must never downgrade 42% to 0%.
    var live={};
    try{ live=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
    var prior=live[ch]||store[ch];
    if(pct<=0 && window.scrollY<50 && prior && prior.t>0) return;
    // nothing to record at the very top of an unread chapter
    if(pct<=0 && window.scrollY<50 && !prior) return;
    store[ch]={p:window.scrollY, t:Math.round(pct*100), at:now};
    try{ localStorage.setItem(KEY,JSON.stringify(store)); }catch(e){}
  }

  // One update per animation frame, not one per scroll event. Scroll fires far
  // faster than the screen refreshes, so the old handler repeated identical work
  // dozens of times per frame.
  var ticking=false;
  function onScroll(){
    if(ticking) return;
    ticking=true;
    requestAnimationFrame(function(){
      ticking=false;
      var top=measure();
      var pct=total>0?Math.min(1,Math.max(0,top/total)):0;
      bar.style.transform='scaleX('+pct+')';
      save(top, total);
    });
  }
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',function(){ total=-1; },{passive:true});
  window.addEventListener('beforeunload',function(){
    var liveTotal=total;
    if(liveTotal<0){ var r=prose.getBoundingClientRect(); liveTotal=r.height-window.innerHeight; }
    save(-(prose.getBoundingClientRect().top), liveTotal);
  });

  // resume toast — only if we have a meaningful saved position
  var prev=store[ch];
  if(prev && prev.p>400){
    var t=document.createElement('div');
    t.className='toast';
    t.innerHTML='Resume where you left off? <a href="#" id="resumeGo">Jump to '+prev.t+'%</a>';
    document.body.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('on'); });
    var close=function(){ t.classList.remove('on'); setTimeout(function(){t.remove();},300); };
    t.querySelector('#resumeGo').addEventListener('click',function(e){
      e.preventDefault(); window.scrollTo({top:prev.p,behavior:'smooth'}); close();
    });
    setTimeout(close, 9000);
  }
})();

/* ---------------------------------------------------------------- continue reading
   Scoped to the book whose hub is open: the card only reports a position inside
   that novel, so the master library page never interrupts a reader with it. */
(function(){
  var el=document.getElementById('continueCard');
  if(!el) return;
  var book=el.getAttribute('data-book')||'';
  if(!book) return;
  var st={};
  try{ st=JSON.parse(localStorage.getItem('th-pos-'+book)||'{}'); }catch(e){}
  var best=null;
  Object.keys(st).forEach(function(ch){
    var v=st[ch];
    if(v && typeof v.at==='number' && (!best || v.at>best.at)) best={ch:+ch,t:v.t,p:v.p,at:v.at};
  });
  if(!best) return;
  var title=el.getAttribute('data-title')||book;
  el.innerHTML='<div class="sub">Pick up where you stopped</div>'+
    '<h3>Chapter '+best.ch+'</h3>'+
    '<p>You were '+best.t+'% through. Straight back to the page.</p>'+
    '<div class="meta"><span>Resume &rarr;</span></div>';
  el.href='c'+best.ch+'.html';
  el.style.display='';
})();

/* ---------------------------------------------------------------- keyboard reading nav */
(function(){
  var prev=document.querySelector('.pager a:not(.r)');
  var next=document.querySelector('.pager a.r');
  var bm=document.querySelector('.bm-btn');
  var tocBtn=document.querySelector('[data-toc-toggle]');
  if(!prev && !next) return;
  document.addEventListener('keydown',function(e){
    var tag=(e.target.tagName||'').toLowerCase();
    if(tag==='input'||tag==='textarea'||e.metaKey||e.ctrlKey) return;
    if(e.key==='j'||e.key==='ArrowRight'){ if(next) next.click(); }
    if(e.key==='k'||e.key==='ArrowLeft'){ if(prev) prev.click(); }
    if(e.key==='b'&&bm){ bm.click(); }
    if(e.key==='c'&&tocBtn){ tocBtn.click(); }
  });
})();

/* ---------------------------------------------------------------- contents + bookmarks */
(function(){
  var toc=document.getElementById('toc');
  var toggle=document.querySelector('[data-toc-toggle]');
  var close=document.getElementById('tocClose');
  var list=document.getElementById('tocList');

  function openToc(on){
    if(!toc) return;
    toc.classList.toggle('open',on);
    document.body.classList.toggle('toc-open',on);
    lockPage(on);
    // deliberately NOT persisted: a restored-open panel on a new page would
    // lock the chapter with no obvious cause (the ATTH "cannot scroll" bug)
  }

  // Deliberately NO page-scroll locking. Anything that sets overflow:hidden on
  // html/body can leave a chapter unscrollable, and the CSS already contains
  // panel scroll to .toc via overscroll-behavior.
  function lockPage(on){ /* intentionally empty */ }
  if(toggle) toggle.addEventListener('click',function(e){
    e.preventDefault(); openToc(!toc.classList.contains('open'));
  });
  if(close) close.addEventListener('click',function(){ openToc(false); });

  // Escape closes it too, so the page can never be left locked.
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape' && toc && toc.classList.contains('open')) openToc(false);
  });
  // Always start closed: a persisted-open panel would lock the page on load.
  try{ localStorage.removeItem('th-toc-open'); }catch(e){}
  document.documentElement.classList.remove('page-locked');
  window.addEventListener('pageshow', function(){
    if(!toc || !toc.classList.contains('open'))
      document.documentElement.classList.remove('page-locked');
  });

  // scroll the current chapter into view INSIDE the list only (never the page)
  var curRow=list && list.querySelector('.toc-row.cur');
  if(curRow){
    var rowTop=curRow.offsetTop, rowH=curRow.offsetHeight;
    var viewH=list.clientHeight;
    if(rowTop < list.scrollTop || rowTop + rowH > list.scrollTop + viewH){
      list.scrollTop = Math.max(0, rowTop - viewH/2 + rowH/2);
    }
  }

  // Close the panel when following a link, so the next page is not left with a stuck drawer
  if(list) list.addEventListener('click', function(e){
    if(e.target.closest('.toc-row')) openToc(false);
  });

  // Wheel over the panel must never scroll the chapter behind it.
  // Scoped tightly: only when the panel is actually open and visible.
  if(toc) toc.addEventListener('wheel', function(e){
    if(!toc.classList.contains('open')) return;          // closed -> never intercept
    if(list && list.contains(e.target)) return;          // list handles its own scroll
    var r = toc.getBoundingClientRect();
    if (r.width < 10 || r.right < 0) return;             // panel off-screen -> never intercept
    e.preventDefault();
  }, {passive:false});

  // Touch equivalent for phones.
  if(toc){
    var ty=0;
    toc.addEventListener('touchstart', function(e){ ty=e.touches[0].clientY; }, {passive:true});
    toc.addEventListener('touchmove', function(e){
      if(list && list.contains(e.target)) return;
      e.preventDefault();
    }, {passive:false});
  }

  /* ---------------- bookmarks (localStorage, per book) */
  if(!list) return;
  var book=(document.body.getAttribute('data-book')||'book');
  var KEY='th-bm-'+book;
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){ return []; } }
  function save(a){ try{ localStorage.setItem(KEY,JSON.stringify(a)); }catch(e){} }

  function paint(){
    var bm=load();
    [].forEach.call(list.querySelectorAll('.toc-row'),function(r){
      r.classList.toggle('bm', bm.indexOf(+r.dataset.ch)>-1);
    });
    var c=document.getElementById('bmCount');
    if(c) c.textContent = bm.length ? '('+bm.length+')' : '';
    var btn=document.querySelector('.bm-btn');
    if(btn){
      var n=+btn.dataset.ch, on=bm.indexOf(n)>-1;
      btn.classList.toggle('on',on);
      btn.querySelector('.star').textContent = on ? '\u2605' : '\u2606';
      btn.querySelector('.lbl').textContent = on ? 'Bookmarked' : 'Bookmark';
    }
    applyFilter();
  }

  function applyFilter(){
    var f=activeFilter;
    var bm=load();
    var shown=0;
    [].forEach.call(list.querySelectorAll('.toc-row'),function(r){
      var keep = f==='all' || bm.indexOf(+r.dataset.ch)>-1;
      r.hidden=!keep; if(keep) shown++;
      // in bookmark mode each row gets its own remove control
      var x=r.querySelector('.toc-bx');
      if(f==='bm' && keep){
        if(!x){
          x=document.createElement('button');
          x.className='toc-bx'; x.type='button';
          x.title='Remove bookmark'; x.setAttribute('aria-label','Remove bookmark');
          x.innerHTML='&times;';
          x.addEventListener('click',function(ev){
            ev.preventDefault(); ev.stopPropagation();
            var n=+r.dataset.ch, a=load(), i=a.indexOf(n);
            if(i>-1) a.splice(i,1);
            save(a); paint();
          });
          r.appendChild(x);
        }
        r.classList.add('bm-mode');
      } else if(x){
        x.remove();
        r.classList.remove('bm-mode');
      }
    });
    // the list is grid:30px 1fr auto; a 4th child needs a column
    list.classList.toggle('bm-mode', f==='bm');
    list.classList.toggle('empty', shown===0);
    var em=document.getElementById('tocEmpty');
    if(em){
      em.innerHTML = (f==='bm')
        ? 'No bookmarks yet. Tap &#9734; on a chapter to save it here.'
        : 'Nothing to show.';
    }
  }

  var activeFilter='all';
  [].forEach.call(document.querySelectorAll('.toc-tab'),function(t){
    t.addEventListener('click',function(){
      [].forEach.call(document.querySelectorAll('.toc-tab'),function(x){x.classList.remove('on');});
      t.classList.add('on'); activeFilter=t.dataset.filter; applyFilter();
    });
  });

  var bbtn=document.querySelector('.bm-btn');
  if(bbtn) bbtn.addEventListener('click',function(){
    var n=+bbtn.dataset.ch, bm=load(), i=bm.indexOf(n);
    if(i>-1) bm.splice(i,1); else bm.push(n);
    bm.sort(function(a,b){return a-b;});
    save(bm); paint();
  });

  paint();
})();

/* ---------------------------------------------------------------- rail expand */
(function(){
  var r=document.getElementById('rail');
  if(!r) return;
  var t=document.getElementById('railToggle');
  var narrow=function(){ return window.matchMedia('(max-width:900px)').matches; };

  // On wide screens the rail pushes the page; on narrow it overlays as a drawer.
  r.addEventListener('mouseenter',function(){
    if(!narrow()) document.body.classList.add('rail-open');
  });
  r.addEventListener('mouseleave',function(){
    if(!narrow()) document.body.classList.remove('rail-open');
  });

  if(t){
    t.addEventListener('click',function(e){
      e.stopPropagation();
      // the class on the rail widens it; body.rail-open is what shifts the page
      var on=r.classList.toggle('open');
      document.body.classList.toggle('rail-open', on);
    });
    document.addEventListener('click',function(e){
      if(narrow() && !r.contains(e.target) && e.target!==t){
        r.classList.remove('open');
        document.body.classList.remove('rail-open');
      }
    });
  }
})();

/* ---------------------------------------------------------------- lightbox */
(function(){
  var lb=document.querySelector('.lightbox');
  if(!lb) return;
  document.addEventListener('click',function(e){
    var t=e.target;
    if(t.tagName==='IMG'&&(t.closest('figure.art')||t.classList.contains('embed'))){
      lb.querySelector('img').src=t.src; lb.classList.add('on'); e.preventDefault();
    } else if(t===lb||lb.contains(t)){ lb.classList.remove('on'); }
  });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') lb.classList.remove('on'); });
})();

/* ---------------------------------------------------------------- search */
(function(){
  var box=document.querySelector('.rail-search')||document.querySelector('.search');
  if(!box) return;
  var input=box.querySelector('input');
  var out=box.querySelector('.sresults');
  var idx=function(){ return window.SEARCH_INDEX||[]; };
  var sel=-1;

  // lazily fetch the external index once
  var loading=false, ready=false;
  function ensureIndex(cb){
    if(ready){ cb(); return; }
    if(loading){ setTimeout(function(){ ensureIndex(cb); }, 60); return; }
    if(!window.SEARCH_URL){ ready=true; cb(); return; }
    loading=true;
    fetch(window.SEARCH_URL).then(function(r){ return r.json(); })
      .then(function(d){ window.SEARCH_INDEX=d; ready=true; loading=false; cb(); })
      .catch(function(){
        // file:// blocks fetch (CORS). Fall back to a classic script load of
        // search.js, which the browser allows from the same folder.
        var s=document.createElement('script');
        s.src=window.SEARCH_URL.replace(/search\.json.*$/,'search.js');
        s.onload=function(){ ready=true; loading=false; cb(); };
        s.onerror=function(){ ready=true; loading=false;
          out.innerHTML='<div class="none">Search needs the local server. Run <code>python serve.py</code>.</div>';
          out.classList.add('on'); };
        document.head.appendChild(s);
      });
  }

  function close(){ out.classList.remove('on'); sel=-1; }
  function draw(items,q){
    if(!items.length){ out.innerHTML='<div class="none">Nothing found.</div>'; out.classList.add('on'); return; }
    var root=document.body.getAttribute('data-root')||'';
    out.innerHTML=items.map(function(it,i){
      var sn=snippet(it,q);
      return '<a href="'+root+it.u+'" class="'+(i===sel?'sel':'')+'"><span>'+it.t+'</span>'+
             (sn?'<span class="sn">'+sn+'</span>':'')+
             '<span class="k">'+it.k+'</span></a>';
    }).join('');
    out.classList.add('on');
  }
  function score(it,q){
    var t=(it.t||'').toLowerCase(), s=(it.s||'').toLowerCase();
    if(t.indexOf(q)===0) return 0;
    if(t.indexOf(q)>-1) return 1;
    if(s.indexOf(q)>-1) return 2;
    // multi-word: every term must appear somewhere
    var parts=q.split(/\s+/).filter(Boolean);
    if(parts.length>1 && parts.every(function(p){return t.indexOf(p)>-1||s.indexOf(p)>-1;})) return 3;
    return 99;
  }
  function snippet(it,q){
    var s=it.s||'', i=s.toLowerCase().indexOf(q);
    if(i<0){ var p=q.split(/\s+/)[0]; i=s.toLowerCase().indexOf(p); }
    if(i<0) return '';
    var a=Math.max(0,i-42), b=Math.min(s.length,i+q.length+62);
    var frag=(a>0?'…':'')+s.slice(a,b).trim()+(b<s.length?'…':'');
    return frag.replace(/</g,'&lt;');
  }
  input.addEventListener('input',function(){
    var q=input.value.trim().toLowerCase();
    if(q.length<2){ close(); return; }
    ensureIndex(function(){ runSearch(q); });
  });

  function runSearch(q){
    var hits=idx().map(function(it){ return {it:it,sc:score(it,q)}; })
                .filter(function(x){ return x.sc<99; })
                .sort(function(a,b){ return a.sc-b.sc||a.it.t.length-b.it.t.length; })
                .slice(0,14).map(function(x){ return x.it; });
    sel=-1; draw(hits,q);
  }
  input.addEventListener('keydown',function(e){
    var links=out.querySelectorAll('a');
    if(!links.length) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); sel=(sel+1)%links.length; draw2(links); }
    if(e.key==='ArrowUp'){ e.preventDefault(); sel=(sel-1+links.length)%links.length; draw2(links); }
    if(e.key==='Enter'&&sel>=0){ e.preventDefault(); links[sel].click(); }
    if(e.key==='Escape'){ close(); input.blur(); }
  });
  function draw2(links){
    links.forEach(function(l,i){ l.classList.toggle('sel',i===sel); });
    if(links[sel]) links[sel].scrollIntoView({block:'nearest'});
  }
  document.addEventListener('click',function(e){ if(!box.contains(e.target)) close(); });
  document.addEventListener('keydown',function(e){
    if(e.key==='/'&&document.activeElement!==input){ e.preventDefault(); input.focus(); }
  });
})();

/* ---------------------------------------------------------------- workspace gate */
(function(){
  var gate=document.getElementById('wsGate');
  var pane=document.getElementById('wsPane');
  if(!gate||!pane) return;
  var KEY='twoheavens-unlocked';
  if(sessionStorage.getItem(KEY)==='1'){ gate.remove(); pane.hidden=false; return; }
  var form=document.getElementById('wsForm');
  if(!form) return;
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var v=form.querySelector('input').value.trim().toLowerCase();
    if(v===window.WS_PASS){
      sessionStorage.setItem(KEY,'1'); gate.remove(); pane.hidden=false;
    }else{
      form.querySelector('input').value='';
      form.querySelector('.err').hidden=false;
    }
  });
})();

/* Reading progress is drawn by the .progbar element created in the chapter
   chrome above. This block used to create a SECOND, unnamed bar on the same
   2px line at z-index 99 - invisible under the .progbar gradient at z-index 120,
   but it still ran its own scroll handler and wrote `width` every frame, which
   forces layout. Two bars, one visible. Removed. */

/* ---------------------------------------------------------------- font-size control */
(function(){
  var KEY='th-fs';
  var cur=parseFloat(localStorage.getItem(KEY)||'100');
  function apply(){ document.documentElement.style.setProperty('--read-scale',(cur/100)); 
    var pr=document.querySelector('.prose'); if(pr) pr.style.fontSize='calc(clamp(1.05rem,0.55vw + 0.92rem,1.17rem) * '+(cur/100)+')'; }
  apply();
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-fs]'); if(!b) return;
    var d=parseInt(b.getAttribute('data-fs'),10);
    cur=Math.min(150,Math.max(85,cur+d));
    localStorage.setItem(KEY,String(cur)); apply();
  });
})();

/* ---------------------------------------------------------------- surface preference
   Opaque vs glass. Both are first-class; glass is the default because the light
   field behind it is the site's own aurora, but a reader who wants the original
   solid panels gets them back exactly, since the whole glass sheet is gated on
   html[data-surface="glass"]. */
(function(){
  var root=document.documentElement;
  var KEY='th-surface';
  function apply(s){
    root.setAttribute('data-surface',s);
    [].forEach.call(document.querySelectorAll('#surfaceSw button'),function(b){
      b.classList.toggle('on', b.dataset.s===s);
      b.setAttribute('aria-pressed', b.dataset.s===s ? 'true' : 'false');
    });
  }
  var saved=null;
  try{ saved=localStorage.getItem(KEY); }catch(e){}
  apply(saved==='opaque' ? 'opaque' : 'glass');

  var sw=document.getElementById('surfaceSw');
  if(sw) sw.addEventListener('click',function(e){
    var b=e.target.closest('button[data-s]');
    if(!b) return;
    try{ localStorage.setItem(KEY,b.dataset.s); }catch(e2){}
    apply(b.dataset.s);
  });
})();

/* ---------------------------------------------------------------- motion preference */
(function(){
  var root=document.documentElement;
  var KEY='th-motion';
  function apply(m){
    root.setAttribute('data-motion',m);
    [].forEach.call(document.querySelectorAll('#motionSw button'),function(b){
      b.classList.toggle('on', b.dataset.m===m);
    });
  }
  // system preference is the default; an explicit choice overrides it
  var saved=null;
  try{ saved=localStorage.getItem(KEY); }catch(e){}
  var prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  apply(saved || (prefersReduced ? 'calm' : 'full'));

  var sw=document.getElementById('motionSw');
  if(sw) sw.addEventListener('click',function(e){
    var b=e.target.closest('button[data-m]');
    if(!b) return;
    try{ localStorage.setItem(KEY,b.dataset.m); }catch(e2){}
    apply(b.dataset.m);
  });
})();

/* ---------------------------------------------------------------- idle detection
   Two jobs: light the rail emblem after a stillness, and offer the way back
   to where the reader stopped. Both switch off on any input. */
(function(){
  var IDLE_MS=8000;      // emblem wakes
  var NUDGE_MS=90000;    // offer resume
  var idleT=null, nudgeT=null;
  var nudge=document.getElementById('idleNudge');

  // `wake` is bound to scroll, and scroll fires many times per frame. The old
  // version wrote classList on every event and cleared/re-armed two timers each
  // time - both cause a style recalc even when nothing changes. Measured: 50
  // class writes for 50 scroll frames, i.e. one per frame, for a state that
  // changes at most once every 8 seconds.
  var idleArmed=false;
  function wake(){
    // only touch the DOM when the state is actually different
    if(document.body.classList.contains('idle')){
      document.body.classList.remove('idle');
      idleArmed=false;
    }
    if(nudge && nudge.classList.contains('on')) nudge.classList.remove('on');
    if(idleArmed) return;          // timer already running; do not restart it
    idleArmed=true;
    clearTimeout(nudgeT);
    idleT=setTimeout(function(){
      document.body.classList.add('idle');
      idleArmed=false;
      nudgeT=setTimeout(showNudge, NUDGE_MS-IDLE_MS);
    }, IDLE_MS);
  }

  function showNudge(){
    if(!nudge) return;
    if(window.scrollY < 400) return;          // nothing to resume from up here
    if(!document.body.classList.contains('reading')) return;
    // report where in the chapter the reader stopped
    var de=document.documentElement;
    var max=de.scrollHeight-window.innerHeight;
    var pct=max>0 ? Math.round(window.scrollY/max*100) : 0;
    var slot=document.getElementById('ndPct');
    if(slot) slot.textContent=pct+'% through';
    nudge.classList.add('on');
  }

  ['mousemove','mousedown','keydown','wheel','touchstart','scroll'].forEach(function(ev){
    window.addEventListener(ev, wake, {passive:true});
  });
  wake();

  if(nudge){
    nudge.querySelector('button').addEventListener('click',function(){
      nudge.classList.remove('on');
    });
  }
})();

/* ---------------------------------------------------------------- scroll self-test
   Open any chapter with the jank parameter in the URL and this measures real
   scroll performance
   on the actual machine and browser, then prints a report to the console. Written
   because a headless browser on a fast machine reported a solid 60fps on a page
   that was visibly sluggish for a reader on integrated graphics - the only
   measurement that settles it is the one taken where the complaint came from.

   It reports the number that matters: how many frames took longer than 32ms,
   which is where scrolling stops feeling smooth. A handful is fine; dozens means
   something is repainting or relayouting.
*/
(function(){
  if(!/(^|[?&])jank([=&]|$)/.test(location.search)) return;
  function start(){
    setTimeout(function(){
      var frames=[], last=performance.now(), stop=false;
      function tick(){ var n=performance.now(); frames.push(n-last); last=n; if(!stop) requestAnimationFrame(tick); }
      requestAnimationFrame(tick);
      window.__jankStop=function(){
        stop=true;
        frames=frames.slice(3);
        var sorted=frames.slice().sort(function(a,b){return a-b;});
        var q=function(f){ return +(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*f))]||0).toFixed(1); };
        var avg=frames.reduce(function(a,b){return a+b;},0)/frames.length;
        var slow=frames.filter(function(d){return d>32;}).length;
        var report={
          frames: frames.length,
          avgMs: +avg.toFixed(1),
          p95Ms: q(.95),
          worstMs: q(1),
          framesOver32ms: slow,
          percentSlow: +(slow/frames.length*100).toFixed(1),
          backdropFilters: 0,
          bigCompositedLayers: [],
          animations: []
        };
        document.querySelectorAll('*').forEach(function(e){
          var c=getComputedStyle(e);
          if((c.backdropFilter&&c.backdropFilter!=='none')) report.backdropFilters++;
          var r=e.getBoundingClientRect();
          if(r.width*r.height>400000 && c.animationName!=='none'){
            report.bigCompositedLayers.push((e.className||e.tagName)+' '+Math.round(r.width)+'x'+Math.round(r.height)+' anim:'+c.animationName);
          }
          if(c.animationName!=='none') report.animations.push(c.animationName);
        });
        report.animations=report.animations.filter(function(v,i,a){return a.indexOf(v)===i;});
        console.group('%cScroll self-test','color:#c9a45c;font-weight:bold');
        console.table(report);
        console.log('Drag the scrollbar while this is recording, then run window.__jankStop().');
        return report;
      };
      console.log('%cRecording scroll frames. Scroll the page, then run: window.__jankStop()',
                  'color:#c9a45c');
    }, 800);
  }
  // app.js is loaded at the end of body, so `load` may already have fired.
  if(document.readyState==='complete') start();
  else window.addEventListener('load', start);
})();




/* ---------------------------------------------------------------- reading surface
   Paper / Glass / Night. Persisted separately from th-surface: the browsing surface
   and the sheet you read on are independent choices, and a reader may well want
   glass panels in the library and parchment prose. */
(function(){
  var root=document.documentElement;
  var KEY='th-sheet';
  var VALID={paper:1,glass:1,night:1};
  function apply(v){
    if(!VALID[v]) v='paper';
    if(v==='paper') root.removeAttribute('data-sheet');
    else root.setAttribute('data-sheet',v);
    [].forEach.call(document.querySelectorAll('.sheet-sw button'),function(b){
      var on = (b.dataset.sh||'paper')===v;
      b.classList.toggle('on',on);
      b.setAttribute('aria-pressed', on?'true':'false');
    });
  }
  var saved=null;
  try{ saved=localStorage.getItem(KEY); }catch(e){}
  apply(saved||'paper');

  document.addEventListener('click',function(e){
    var b=e.target.closest?e.target.closest('.sheet-sw button'):null;
    if(!b) return;
    var v=b.dataset.sh||'paper';
    try{ localStorage.setItem(KEY,v); }catch(e2){}
    apply(v);
  });
})();
