// Run after building: PLAYWRIGHT_MODULE=<module path> node tests/chat-browser-regression.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  try {
    for (const [width,height,mobile,dark] of [[375,667,true],[390,844,true],[844,390,true],[430,915,true],[1280,900,false]].flatMap(layout=>[[...layout,false],[...layout,true]])) {
      const page = await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.setContent('<style>'+fs.readFileSync(path.join(repo,'styles.css'),'utf8')+'</style><style>body{margin:0;font:16px Arial;--background-primary:white;--text-normal:black;--interactive-accent:#4477dd;--background-modifier-hover:#ddd}.solomon-chat-view-content{position:absolute;top:70px;bottom:0;width:100%}*{box-sizing:border-box}</style>');
      await page.evaluate((dark)=>{for(const [key,value] of Object.entries({'--background-primary':dark?'#202020':'#ffffff','--background-primary-alt':dark?'#282828':'#f6f6f6','--text-normal':dark?'#eeeeee':'#111111','--text-muted':dark?'#bbbbbb':'#555555','--background-modifier-border':dark?'#444444':'#dddddd'}))document.body.style.setProperty(key,value);},dark);
      await page.evaluate((mobile) => {
        if(mobile){document.body.style.setProperty('--mobile-toolbar-height','52px');document.body.style.setProperty('--navbar-bottom-offset','max(24px, 12px)');}
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
        class Modal extends Base {constructor(app){super();this.app=app;}open(){this.modalEl=document.body.createDiv();this.modalEl.setCssProps({position:'fixed',inset:'10px','z-index':'100',background:'white',overflow:'auto'});this.contentEl=this.modalEl.createDiv();this.onOpen();}close(){this.modalEl.remove();}setTitle(title){this.modalEl.setAttribute('role','dialog');this.modalEl.setAttribute('aria-label',title);}}
        class FuzzySuggestModal extends Modal {setPlaceholder(){}onOpen(){this.setTitle('Choose vault picture');for(const item of this.getItems()){this.contentEl.createEl('button',{text:this.getItemText(item)}).addEventListener('click',()=>{this.close();this.onChooseItem(item);});}}}
        class Setting {constructor(parent){this.el=parent.createDiv();}setName(name){this.name=name;return this;}setDesc(text){this.el.setAttribute('data-description',text);return this;}
          addText(callback){return this.input('text',callback);}addColorPicker(callback){return this.input('color',callback);}
          input(type,callback){const el=this.el.createEl('input',{attr:{type,'aria-label':this.name}});const c={inputEl:el,setValue(v){el.value=v;return c;},setPlaceholder(v){el.placeholder=v;return c;},onChange(fn){el.addEventListener('input',()=>fn(el.value));return c;}};callback(c);return this;}
          addButton(callback){const el=this.el.createEl('button');const c={setButtonText(v){el.textContent=v;return c;},setDisabled(v){el.disabled=v;return c;},onClick(fn){el.addEventListener('click',fn);return c;}};callback(c);return this;}
          addExtraButton(callback){const el=this.el.createEl('button');const c={setIcon(){return c;},setTooltip(v){el.setAttribute('aria-label',v);return c;},onClick(fn){el.addEventListener('click',fn);return c;}};callback(c);return this;}}
        window.require=()=>({Plugin,Component:Base,TextFileView,MarkdownView:Base,Modal,FuzzySuggestModal,Setting,PluginSettingTab:Base,TFile:Base,TFolder:Base,Notice:Base,Menu:Base,Platform:{isMobile:mobile},setIcon(){},normalizePath:p=>p,MarkdownRenderer:{async render(_app,text,el){el.createEl('p',{text});}}});
        window.module={exports:{}};
      },mobile);
      await page.addScriptTag({content:fs.readFileSync(process.env.PLUGIN_BUNDLE || path.join(repo,'main.js'),'utf8')});
      await page.evaluate(async () => {
        window.plugin=new window.module.exports.default(); await plugin.onload();
        plugin.restoreDraft=()=>'';
        window.leaf={}; leaf.view=window.viewFactory(leaf);
        window.file={path:'Test.md',basename:'Test'};leaf.view.file=file;
        window.chat={messages:[],conversationId:'',attachmentFolder:'Test.attachments',backgroundColor:'',backgroundImage:'',leftName:'Me',rightName:'Wiser self',nextSide:'right',preamble:''};
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
      if(mobile)assert.equal(await page.locator('.solomon-chat-bottom-inset-probe').evaluate(el=>el.getBoundingClientRect().height),76,'closed mobile clearance includes raised native navbar offset');
      if(width===390 && !dark && !process.env.PLUGIN_BUNDLE)await page.screenshot({path:path.join(repo,'docs/testing/iphone-message-containment-regression.png')});
      await page.evaluate(async()=>{for(let i=0;i<3;i++){append();await settle();}for(let i=0;i<30;i++)append();draw();await settle();});
      const bottom=()=>page.evaluate(()=>{const m=document.querySelector('.solomon-chat-messages');return m.scrollHeight-m.clientHeight-m.scrollTop;});
      assert.ok(await bottom()<2,'append and duplicate render follow latest');
      await page.evaluate(async()=>{leaf.view.contentEl.style.bottom='180px';await settle();});
      assert.ok(await bottom()<2,'keyboard-size change follows latest');
      await page.evaluate(async()=>{document.querySelector('.solomon-chat-message:last-child p').style.height='240px';await settle();});
      assert.ok(await bottom()<2,'late content resize follows latest');
      await page.evaluate(async()=>{document.querySelector('.solomon-chat-messages').scrollTop=100;await settle();append();draw();await settle();});
      const history=await page.evaluate(()=>({top:document.querySelector('.solomon-chat-messages').scrollTop,latest:document.querySelector('.solomon-chat-jump-latest').getAttribute('aria-hidden')}));
      assert.ok(Math.abs(history.top-100)<2,'history position preserved');assert.equal(history.latest,'false');
      await page.getByRole('button',{name:'Jump to latest message',exact:true}).click();
      await page.evaluate(()=>settle());assert.ok(await bottom()<2,'latest button scrolls');
      const containment=await page.evaluate(()=>[...document.querySelectorAll('.solomon-chat-message')].every(el=>el.getBoundingClientRect().height>=el.querySelector('.solomon-chat-bubble').getBoundingClientRect().height));
      assert.ok(containment);assert.deepEqual(errors,[]);
      await page.evaluate(async()=>{const m=document.querySelector('.solomon-chat-messages');m.scrollTop=100;await settle();plugin.states.get(leaf).scrollAfterNextAppend=true;append();await settle();});
      assert.ok(await bottom()<2,'own send returns to latest while reading history');
      await page.evaluate(async()=>{
        const state=plugin.states.get(leaf);
        state.messages.scrollTop=100;await settle();
        state.scrollAfterNextAppend=true;
        // Obsidian can refresh unchanged data while an own-send write is pending.
        draw();await settle();
        append();await settle();
      });
      assert.ok(await bottom()<2,'unchanged refresh before own append preserves latest-message intent');
      await page.evaluate(async()=>{
        const state=plugin.states.get(leaf);
        state.messages.scrollTop=100;await settle();
        state.scrollAfterNextAppend=true;
        chat.messages[0]={...chat.messages[0],content:'Earlier message edited concurrently'};
        append();await settle();
      });
      assert.ok(await bottom()<2,'own send follows latest even when refresh rebuilds transcript');
      await page.evaluate(async()=>{
        const state=plugin.states.get(leaf);state.messages.scrollTop=100;await settle();
        chat.messages[0]={...chat.messages[0],content:'Another earlier edit'};append();draw();await settle();
      });
      assert.equal(await page.getByRole('button',{name:'Jump to latest message',exact:true}).getAttribute('aria-hidden'),'false','incoming rebuild keeps Latest available in history');
      await page.getByRole('button',{name:'Jump to latest message',exact:true}).click();
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
      const sendFlow=await page.evaluate(async()=>{
        const state=plugin.states.get(leaf),textarea=state.textarea;
        plugin.saveData=async()=>{};
        let sequence=0;plugin.newId=(prefix)=>prefix+'-'+String(++sequence).padStart(16,'0');
        let stored='---\nsolomon-chat: true\n---\n',release,processCount=0;
        plugin.app.vault.read=async()=>stored;
        plugin.app.vault.getAbstractFileByPath=()=>null;
        plugin.app.vault.process=async(_file,change)=>{processCount++;await new Promise(r=>release=r);stored=change(stored);};
        textarea.focus();let blurs=0;textarea.addEventListener('blur',()=>blurs++);
        const pending=plugin.submit(state);await settle();await plugin.submit(state);
        const stable=document.activeElement===textarea&&!textarea.readOnly;
        release();await pending;
        const success=stable&&document.activeElement===textarea&&textarea.value===''&&processCount===1&&blurs===0;
        textarea.value='Keep this on failure';textarea.dispatchEvent(new Event('input'));
        plugin.app.vault.process=async()=>{throw new Error('Expected test failure');};
        await plugin.submit(state);
        const failure=textarea.value==='Keep this on failure'&&!state.sending&&!textarea.readOnly&&document.activeElement===textarea;
        plugin.app.vault.process=async(_file,change)=>{await new Promise(r=>release=r);stored=change(stored);};
        const next=plugin.submit(state);await settle();
        const other=document.body.createEl('button',{text:'Elsewhere'});other.focus();release();await next;
        const noSteal=document.activeElement===other;other.remove();
        return {success,failure,noSteal};
      });
      assert.deepEqual(sendFlow,{success:true,failure:true,noSteal:true});
      if(mobile){
        const touchSend=await page.evaluate(async()=>{
          const state=plugin.states.get(leaf),textarea=state.textarea,send=state.send;
          let writes=0,release;plugin.app.vault.process=async()=>{writes++;await new Promise(r=>release=r);};
          textarea.value='Touch send';textarea.dispatchEvent(new Event('input'));textarea.focus();
          let blurs=0;const recordBlur=()=>blurs++;textarea.addEventListener('blur',recordBlur);
          // Model a bubbling outside-input dismiss handler. This is a host-contract
          // regression, not a claim that desktop Chromium reproduces the iOS keyboard.
          const dismiss=event=>{if(!event.defaultPrevented && event.target!==textarea)textarea.blur();};
          document.addEventListener('touchstart',dismiss);document.addEventListener('touchend',dismiss);
          const rect=send.getBoundingClientRect();
          const finger={identifier:1,clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2};
          const touch=(type,point=finger)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[point]},changedTouches:{value:[point]}});send.dispatchEvent(e);return e;};
          touch('touchstart');const end=touch('touchend');
          if(!end.defaultPrevented)send.click();
          await settle();send.click();await settle();
          const during=document.activeElement===textarea;
          release?.();await settle();
          const result={during,after:document.activeElement===textarea,blurs,writes,cleared:textarea.value===''};
          document.removeEventListener('touchstart',dismiss);document.removeEventListener('touchend',dismiss);textarea.removeEventListener('blur',recordBlur);
          textarea.value='Keep canceled gesture';textarea.dispatchEvent(new Event('input'));
          touch('touchstart');touch('touchmove',{...finger,clientX:finger.clientX+30});touch('touchend');
          touch('touchstart');touch('touchcancel');touch('touchend');
          touch('touchstart');touch('touchend',{...finger,clientX:rect.right+20});
          const multi=new Event('touchstart',{bubbles:true,cancelable:true});Object.defineProperty(multi,'touches',{value:[finger,{...finger,identifier:2}]});send.dispatchEvent(multi);touch('touchend');
          await settle();result.canceled=writes===1&&textarea.value==='Keep canceled gesture';
          textarea.blur();send.click();result.clickFocus=document.activeElement===textarea;
          await settle();release?.();await settle();result.clickSent=writes===2&&textarea.value==='';
          return result;
        });
        assert.deepEqual(touchSend,{during:true,after:true,blurs:0,writes:1,cleared:true,canceled:true,clickFocus:true,clickSent:true},'touch Send must retain composer focus, reject canceled gestures and support click-only activation');
      }
      const background=await page.evaluate(()=>{
        const state=plugin.states.get(leaf);
        state.conversation.backgroundColor='#aabbcc';plugin.applyBackground(state);
        const color=getComputedStyle(state.root).backgroundColor;
        state.conversation.backgroundImage='missing.png';plugin.applyBackground(state);
        const missing=getComputedStyle(state.root).backgroundImage;
        state.conversation.backgroundColor='url(https://invalid.example/x)';plugin.applyBackground(state);
        const safe=!state.root.classList.contains('has-custom-background');
        return {color,missing,safe};
      });
      assert.deepEqual(background,{color:'rgb(170, 187, 204)',missing:'none',safe:true});
      await page.evaluate(()=>{
        const state=plugin.states.get(leaf);state.conversation.backgroundColor='';state.conversation.backgroundImage='';
        plugin.app.fileManager={async processFrontMatter(_file,update){window.savedBackground={};update(window.savedBackground);}};
        plugin.openBackgroundModal(state);
      });
      await page.getByRole('textbox',{name:'Wallpaper image',exact:true}).fill('https://example.com/remote.png');
      assert.equal(await page.getByRole('button',{name:'Choose picture',exact:true}).count(),1,'picture chooser is available without typing a path');
      await page.getByRole('button',{name:'Save',exact:true}).click();
      assert.match(await page.getByRole('alert').innerText(),/existing supported image/);
      await page.getByRole('textbox',{name:'Wallpaper image',exact:true}).fill('');
      await page.getByLabel('Background color',{exact:true}).fill('#aabbcc');
      await page.getByRole('button',{name:'Save',exact:true}).click();
      await page.evaluate(()=>settle());
      assert.equal(await page.evaluate(()=>window.savedBackground['chat-background-color']),'#aabbcc');
      await page.evaluate(()=>plugin.openBackgroundModal(plugin.states.get(leaf)));
      await page.getByRole('button',{name:'Use theme background',exact:true}).click();
      await page.getByRole('button',{name:'Save',exact:true}).click();
      await page.evaluate(()=>settle());
      assert.deepEqual(await page.evaluate(()=>window.savedBackground),{});
      assert.equal(await page.evaluate(()=>plugin.states.get(leaf).root.classList.contains('has-custom-background')),false);
      await page.evaluate(()=>{
        const image=new (window.require().TFile)();image.path='Wallpapers/sky.png';
        const files=new Map([[image.path,image]]);
        plugin.app.vault.getAbstractFileByPath=p=>files.get(p)||null;
        plugin.app.vault.getFiles=()=>[image,{path:'Notes/private.md'},{path:'Wallpapers/unsafe.svg'}];
        plugin.app.vault.getResourcePath=()=> 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6N8AAAAASUVORK5CYII=';
        plugin.openBackgroundModal(plugin.states.get(leaf));
      });
      await page.getByRole('button',{name:'Choose picture',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Notes/private.md',exact:true}).count(),0);
      assert.equal(await page.getByRole('button',{name:'Wallpapers/unsafe.svg',exact:true}).count(),0);
      await page.getByRole('button',{name:'Wallpapers/sky.png',exact:true}).click();
      assert.equal(await page.getByRole('textbox',{name:'Wallpaper image',exact:true}).inputValue(),'Wallpapers/sky.png');
      await page.evaluate(()=>{plugin.app.fileManager.processFrontMatter=async(_file,update)=>{await new Promise(resolve=>{window.releasePictureSave=resolve;});window.savedBackground={};update(window.savedBackground);};});
      await page.getByRole('button',{name:'Save',exact:true}).click();
      await page.waitForFunction(()=>!!window.releasePictureSave);
      const busy=await page.evaluate(()=>{const modal=document.querySelector('[aria-label="Chat background"]');const cancel=[...modal.querySelectorAll('button')].find(e=>e.textContent==='Cancel');cancel.click();return {open:modal.isConnected,inert:modal.querySelector('[aria-busy="true"]')?.inert};});
      assert.deepEqual(busy,{open:true,inert:true},'pending saves freeze controls and cannot be cancelled midway');
      await page.evaluate(()=>window.releasePictureSave());
      await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
      const imported=await page.evaluate(()=>({path:window.savedBackground['chat-background-image'],applied:getComputedStyle(plugin.states.get(leaf).root).backgroundImage}));
      assert.equal(imported.path,'Wallpapers/sky.png');
      assert.match(imported.applied,/url\(/);
      if(mobile){
        const textarea=page.getByRole('textbox',{name:'Message',exact:true});
        await textarea.fill('First line');
        await textarea.press('Enter');
        await textarea.press('a');
        assert.equal(await textarea.inputValue(),'First line\na','mobile Enter inserts a newline, never sends');
        assert.equal(await textarea.getAttribute('enterkeyhint'),'enter');
      }
      const wallpaper=await page.evaluate(()=>{
        const state=plugin.states.get(leaf),image=new (window.require().TFile)();
        plugin.app.vault.getAbstractFileByPath=(path)=>path==='Wallpapers/test.png'?image:null;
        plugin.app.vault.getResourcePath=()=> 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6N8AAAAASUVORK5CYII=';
        state.conversation.backgroundImage='Wallpapers/test.png';plugin.applyBackground(state);
        const applied=getComputedStyle(state.root).backgroundImage.startsWith('url(');
        state.conversation.backgroundImage='';state.conversation.backgroundColor='#d8e5eb';plugin.applyBackground(state);
        state.textarea.value='Keep my selection';state.draft=state.textarea.value;state.textarea.focus();state.textarea.setSelectionRange(2,5);
        plugin.render(leaf,file,state.conversation);
        return applied;
      });
      assert.equal(wallpaper,true);
      const backing=await page.evaluate(()=>{
        const state=plugin.states.get(leaf);state.root.style.setProperty('--background-modifier-hover','rgba(0,0,0,0.08)');
        const message=state.messages.querySelector('.solomon-chat-message');message.classList.replace('is-right','is-left');
        return [getComputedStyle(message.querySelector('.solomon-chat-bubble')).backgroundColor,getComputedStyle(message.querySelector('.solomon-chat-message-action')).backgroundColor];
      });
      assert.deepEqual(backing,[dark?'rgb(32, 32, 32)':'rgb(255, 255, 255)',dark?'rgb(32, 32, 32)':'rgb(255, 255, 255)'],'wallpaper cannot show through bubble or action backing');
      await page.evaluate(()=>settle());
      assert.deepEqual(await page.evaluate(()=>{const t=document.querySelector('textarea');return [t.selectionStart,t.selectionEnd];}),[2,5]);
      if(width===390)await page.screenshot({path:path.join(repo,`docs/testing/chat-background-${dark?'dark':'light'}.png`)});
      console.log(JSON.stringify({width,height,mobile,dark,firstMessage:true,append:true,keyboardResize:true,lateContent:true,history:true,latest:true,containment:true,composer:true,sendFlow:true,background:true}));
      await page.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
