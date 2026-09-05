// Run after building: PLAYWRIGHT_MODULE=<module path> node tests/chat-browser-regression.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  try {
    for (const [width,height,mobile] of [[375,667,true],[390,844,true],[844,390,true],[430,915,true],[1280,900,false]]) {
      const page = await browser.newPage({viewport:{width,height}});
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.setContent('<style>'+fs.readFileSync(path.join(repo,'styles.css'),'utf8')+'</style><style>body{margin:0;font:16px Arial;--background-primary:white;--text-normal:black;--interactive-accent:#4477dd;--background-modifier-hover:#ddd}.solomon-chat-view-content{position:absolute;top:70px;bottom:0;width:100%}*{box-sizing:border-box}</style>');
      await page.evaluate((mobile) => {
        HTMLElement.prototype.createEl = function(tag, options={}) { const el=document.createElement(tag); if(options.cls) el.className=options.cls; if(options.text) el.textContent=options.text; for(const [k,v] of Object.entries(options.attr||{})) el.setAttribute(k,v); this.append(el); return el; };
        HTMLElement.prototype.createDiv = function(o){return this.createEl('div',o);};
        HTMLElement.prototype.createSpan = function(o){return this.createEl('span',o);};
        HTMLElement.prototype.empty = function(){this.replaceChildren();};
        HTMLElement.prototype.addClass = function(...c){this.classList.add(...c);};
        HTMLElement.prototype.removeClass = function(...c){this.classList.remove(...c);};
        HTMLElement.prototype.toggleClass = function(c,v){this.classList.toggle(c,v);};
        HTMLElement.prototype.setText = function(t){this.textContent=t;};
        HTMLElement.prototype.setCssProps = function(p){for(const [k,v] of Object.entries(p))this.style.setProperty(k,v);};
        class Base {load(){} unload(){} }
        class Plugin extends Base {constructor(){super(); this.app={workspace:{on(){},onLayoutReady(){}},vault:{on(){}},metadataCache:{on(){}}};} async loadData(){return null;} registerView(_id,f){window.viewFactory=f;} addRibbonIcon(){} addCommand(){} addSettingTab(){} registerEvent(){} registerDomEvent(){} register(){} }
        class TextFileView extends Base {constructor(leaf){super();this.leaf=leaf;this.containerEl=document.body.createDiv();this.contentEl=this.containerEl.createDiv();} addAction(){return this.containerEl.createEl('button');}}
        window.require=()=>({Plugin,Component:Base,TextFileView,MarkdownView:Base,Modal:Base,PluginSettingTab:Base,TFile:Base,TFolder:Base,Notice:Base,Menu:Base,Platform:{isMobile:mobile},setIcon(){},normalizePath:p=>p,MarkdownRenderer:{async render(_app,text,el){el.createEl('p',{text});}}});
        window.module={exports:{}};
      },mobile);
      await page.addScriptTag({content:fs.readFileSync(process.env.PLUGIN_BUNDLE || path.join(repo,'main.js'),'utf8')});
      await page.evaluate(async () => {
        window.plugin=new window.module.exports.default(); await plugin.onload();
        plugin.restoreDraft=()=>'';
        window.leaf={}; leaf.view=window.viewFactory(leaf);
        window.file={path:'Test.md',basename:'Test'};leaf.view.file=file;
        window.chat={messages:[],leftName:'Me',rightName:'Wiser self',nextSide:'right',preamble:''};
        window.draw=()=>plugin.render(leaf,file,{...chat,messages:[...chat.messages]});
        window.append=()=>{chat.messages.push({id:String(chat.messages.length),side:'right',timestamp:'',content:'A message with enough text to wrap onto multiple lines on a phone.'});draw();};
        window.settle=()=>new Promise(r=>window.setTimeout(r,100));
        draw();await settle();append();await settle();
      });
      const first=await page.evaluate(()=>({empty:!!document.querySelector('.solomon-chat-empty'),clientHeight:document.querySelector('.solomon-chat-messages').clientHeight,top:document.querySelector('.solomon-chat-bubble').getBoundingClientRect().top,viewTop:leaf.view.contentEl.getBoundingClientRect().top}));
      console.log(JSON.stringify({width,height,first}));
      assert.ok(first.clientHeight>100,'host provides a usable transcript height');
      if(process.env.SCENARIO!=='scroll')assert.equal(first.empty,false,'first append removes the empty prompt');
      assert.ok(first.top>=first.viewTop);
      if(width===390 && !process.env.PLUGIN_BUNDLE)await page.screenshot({path:path.join(repo,'docs/testing/iphone-message-containment-regression.png')});
      await page.evaluate(async()=>{for(let i=0;i<3;i++){append();await settle();}for(let i=0;i<30;i++)append();draw();await settle();});
      const bottom=()=>page.evaluate(()=>{const m=document.querySelector('.solomon-chat-messages');return m.scrollHeight-m.clientHeight-m.scrollTop;});
      assert.ok(await bottom()<2,'append and duplicate render follow latest');
      await page.evaluate(async()=>{leaf.view.contentEl.style.bottom='180px';await settle();});
      assert.ok(await bottom()<2,'keyboard-size change follows latest');
      await page.evaluate(async()=>{document.querySelector('.solomon-chat-message:last-child p').style.height='240px';await settle();});
      assert.ok(await bottom()<2,'late content resize follows latest');
      await page.evaluate(async()=>{document.querySelector('.solomon-chat-messages').scrollTop=100;await settle();append();await settle();});
      const history=await page.evaluate(()=>({top:document.querySelector('.solomon-chat-messages').scrollTop,latest:document.querySelector('.solomon-chat-jump-latest').getAttribute('aria-hidden')}));
      assert.ok(Math.abs(history.top-100)<2,'history position preserved');assert.equal(history.latest,'false');
      await page.getByRole('button',{name:'Jump to latest message',exact:true}).click();
      await page.evaluate(()=>settle());assert.ok(await bottom()<2,'latest button scrolls');
      const containment=await page.evaluate(()=>[...document.querySelectorAll('.solomon-chat-message')].every(el=>el.getBoundingClientRect().height>=el.querySelector('.solomon-chat-bubble').getBoundingClientRect().height));
      assert.ok(containment);assert.deepEqual(errors,[]);
      await page.evaluate(async()=>{const m=document.querySelector('.solomon-chat-messages');m.scrollTop=100;await settle();plugin.states.get(leaf).scrollAfterNextAppend=true;append();await settle();});
      assert.ok(await bottom()<2,'own send returns to latest while reading history');
      const composer=await page.evaluate(async()=>{
        const state=plugin.states.get(leaf), textarea=state.textarea;
        textarea.focus();textarea.value='Message being sent';textarea.dispatchEvent(new Event('input'));
        plugin.inFlightFiles.add(file);plugin.refreshFileSendingState(file);
        const input=new InputEvent('beforeinput',{inputType:'insertText',data:'x',cancelable:true,bubbles:true});
        textarea.dispatchEvent(input);
        const result={readOnly:textarea.readOnly,focused:document.activeElement===textarea,guarded:input.defaultPrevented,sendDisabled:state.send.disabled};
        plugin.finishFileSend(file);await settle();
        result.sameField=document.querySelector('textarea')===textarea;
        result.draft=textarea.value;return result;
      });
      assert.equal(composer.readOnly,false,'sending must not toggle mobile keyboard eligibility');
      assert.equal(composer.focused,true);assert.equal(composer.guarded,true);
      assert.equal(composer.sendDisabled,true);assert.equal(composer.sameField,true);assert.equal(composer.draft,'Message being sent');
      console.log(JSON.stringify({width,height,mobile,firstMessage:true,append:true,keyboardResize:true,lateContent:true,history:true,latest:true,containment:true}));
      await page.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
