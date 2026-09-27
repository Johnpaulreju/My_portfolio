/* Real Chromium layout/input regression. Start this worktree on GAME_QA_URL first.
 * Uses an existing Playwright installation, without adding project dependencies:
 * GAME_QA_PLAYWRIGHT=/path/to/playwright node tests/games/layout-browser.cjs
 * Screenshots and measurements default to ignored .cache/qa-games/browser.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.GAME_QA_PLAYWRIGHT || 'playwright')
const out = path.resolve(process.env.GAME_QA_OUTPUT || '.cache/qa-games/browser')
fs.mkdirSync(path.join(out, 'tmp'), { recursive: true })
process.env.TMPDIR = path.join(out, 'tmp')
const evidence = [], errors = []
const record = (name, result) => { evidence.push({ name, result }); console.log(name, JSON.stringify(result)) }
const wait = (page, ms = 400) => page.waitForTimeout(ms)
async function run() {
  const browser = await chromium.launch({ executablePath: process.env.GAME_QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, env: { ...process.env, TMPDIR: path.join(out, 'tmp') } })
  try {
    const context = await browser.newContext({ viewport: { width:390, height:844 }, hasTouch:true })
    const page = await context.newPage()
    page.setDefaultTimeout(7000)
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if(m.type() === 'error') record('console',m.text()) })
    const shot = async name => { await wait(page); await page.screenshot({path:path.join(out, name+'.png')}) }
    await page.goto(process.env.GAME_QA_URL || 'http://127.0.0.1:3122')
    await page.getByLabel('Open in full screen').uncheck()
    await page.getByRole('button',{name:'Power on',exact:true}).click()
    await wait(page,5800)
    const home = async () => { await page.getByRole('navigation',{name:'Phone navigation'}).getByRole('button',{name:'Home',exact:true}).click(); await wait(page) }
    const launch = async name => {
      if(page.viewportSize().width < 768) {
        await home()
        await page.getByRole('button',{name:'All apps',exact:true}).click()
        await page.getByRole('searchbox',{name:'Search apps'}).fill(name)
        await page.getByRole('dialog',{name:'All apps',exact:true}).getByRole('button',{name,exact:true}).click()
      } else {
        await page.getByRole('button',{name:'Start',exact:true}).click()
        await page.getByLabel('Search for apps and files').fill(name)
        await page.getByRole('dialog',{name:'Start menu'}).getByRole('button',{name,exact:true}).click()
      }
      await wait(page)
    }
    const race = page.locator('.ridgeline-layout')
    const raceControls = race.locator('.ridgeline-controls')
    const mines = page.locator('.mines-layout')
    const cards = page.locator('.solitaire-layout')
    const raceGeometry = async label => {
      const geometry = await race.evaluate(e => {
        const r = n => { const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom} }
        return {root:r(e),scroll:e.scrollHeight,track:r(e.querySelector('.ridgeline-track')),canvas:r(e.querySelector('canvas')),buttons:[...e.querySelectorAll('.ridgeline-controls button')].map(r)}
      })
      assert.ok(geometry.scroll <= geometry.root.height+1, label+' race has no scrolling')
      assert.ok(geometry.track.height >= 110, label+' road look-ahead height')
      assert.ok(Math.abs(geometry.canvas.height-geometry.track.height)<1)
      for(const b of geometry.buttons) {
        assert.ok(b.width>=44 && b.height>=44, label+' usable driving targets')
        assert.ok(b.x>=geometry.root.x-1 && b.right<=geometry.root.right+1 && b.bottom<=geometry.root.bottom+1)
      }
      record(label+' race layout',geometry)
    }
    await launch('Ridgeline')
    await race.getByRole('button',{name:'Race',exact:true}).click()
    await launch('Minesweeper')
    await mines.getByRole('button',{name:'Game',exact:true}).click()
    await mines.getByRole('menuitem',{name:/Intermediate/}).click()
    await launch('Solitaire')
    if (!process.env.GAME_QA_DESKTOP_ONLY) {
    for(const [width,height] of [[320,568],[390,844],[568,320],[640,360]]) {
      const label=width+'x'+height
      await page.setViewportSize({width,height})
      await launch('Ridgeline'); await raceGeometry(label); await shot(label+'-ridgeline')
      await launch('Minesweeper'); await shot(label+'-minesweeper')
      // Measure the hidden Solitaire only after showing it, not its inactive transform.
      const mineBox=await mines.locator('.mines-board').boundingBox()
      assert.ok(mineBox.height>=110)
      assert.ok((await mines.locator('[data-idx="0"]').boundingBox()).height>=36)
      await launch('Solitaire'); await shot(label+'-solitaire')
      const cardBox=await cards.locator('.solitaire-scroll').boundingBox()
      assert.ok(cardBox.height>=110)
      assert.ok((await cards.getByRole('button',{name:'Draw a card from stock'}).boundingBox()).width>=48)
      record(label+' puzzle viewports',{mines:mineBox,solitaire:cardBox})
    }
    await page.setViewportSize({width:568,height:320})
    await launch('Ridgeline')
    const cdp=await context.newCDPSession(page)
    const touch=async (type,points=[]) => cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points})
    const point=async (name,id) => {const b=await raceControls.getByRole('button',{name,exact:true}).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2,id}}
    const gas=await point('Gas ↑',1),left=await point('← Left',2),strike=await point('Strike ←',3),brake=await point('Brake ↓',4)
    await touch('touchStart',[gas]); await touch('touchStart',[gas,left]); await touch('touchStart',[gas,left,strike])
    assert.equal(await raceControls.locator('[aria-pressed="true"]').count(),3)
    await touch('touchCancel')
    assert.equal(await raceControls.locator('[aria-pressed="true"]').count(),0)
    record('simultaneous Gas+Left+Strike then cancel','3 pressed -> 0')
    await touch('touchStart',[gas]); await touch('touchStart',[gas,brake]); await touch('touchEnd',[brake])
    assert.equal(await raceControls.locator('[aria-pressed="true"]').count(),1)
    assert.equal(await raceControls.getByRole('button',{name:'Gas ↑'}).getAttribute('aria-pressed'),'true')
    await touch('touchEnd')
    // Explicitly release actual established pointer capture; no fake input handlers.
    await raceControls.evaluate(el=>{el.addEventListener('gotpointercapture',e=>{el._capture={target:e.target,id:e.pointerId}},{once:true})})
    await touch('touchStart',[gas]); await touch('touchMove',[{...gas,x:gas.x+1}]); await wait(page,100)
    assert.equal(await raceControls.evaluate(el=>{const c=el._capture;if(!c||!c.target.hasPointerCapture(c.id))return false;c.target.releasePointerCapture(c.id);return true}),true)
    await touch('touchMove',[{...gas,x:gas.x+2}]); await wait(page,100)
    assert.equal(await raceControls.locator('[aria-pressed="true"]').count(),0)
    await touch('touchCancel')
    record('actual lostpointercapture and partial lift','all released; lifting Brake retained Gas')
    await touch('touchStart',[gas,left]); await home()
    assert.equal(await raceControls.locator('[aria-pressed="true"]').count(),0)
    assert.equal(await raceControls.locator(':disabled').count(),6)
    await touch('touchCancel'); await launch('Ridgeline')
    await race.getByRole('button',{name:'Pause',exact:true}).click()
    assert.match(await race.innerText(),/Paused/)
    await race.getByRole('button',{name:'Resume',exact:true}).first().click()
    await race.getByRole('button',{name:'Restart',exact:true}).first().click()
    await shot('568-touch-cancellation')
    await launch('Minesweeper')
    await mines.locator('[data-idx="0"]').click()
    await wait(page,1100)
    const timer=()=>mines.getByRole('img',{name:/Seconds elapsed/,includeHidden:true}).getAttribute('aria-label')
    await home(); const time=await timer(); const labels=await mines.locator('[data-idx]').evaluateAll(a=>a.map(e=>e.getAttribute('aria-label')))
    await wait(page,1300); assert.equal(await timer(),time)
    await launch('Minesweeper'); assert.deepEqual(await mines.locator('[data-idx]').evaluateAll(a=>a.map(e=>e.getAttribute('aria-label'))),labels)
    await page.getByRole('button',{name:/^Notifications and quick settings/}).click()
    const shadeTime=await timer(); await wait(page,1300); assert.equal(await timer(),shadeTime)
    await page.getByRole('button',{name:'Close Quick settings and notifications',exact:true}).click()
    record('Minesweeper shade pauses activity',shadeTime)
    await mines.getByRole('button',{name:/Flag mode/}).click()
    const target=await mines.locator('[data-idx]').evaluateAll(a=>a.find(e=>e.getAttribute('aria-label').includes('hidden'))?.getAttribute('data-idx'))
    assert.ok(target, 'a covered cell is available for flagging')
    if(target) {await mines.locator(`[data-idx="${target}"]`).click();assert.match(await mines.locator(`[data-idx="${target}"]`).getAttribute('aria-label'),/flag/i)}
    await mines.getByRole('button',{name:'Game',exact:true}).click()
    await mines.getByRole('menuitem',{name:'How to play',exact:true}).click()
    const helpTime=await timer(); await wait(page,1200); assert.equal(await timer(),helpTime)
    await shot('568-mines-help')
    await page.getByRole('button',{name:'Back to game'}).click()
    record('Minesweeper Home + help pause',{time,helpTime})
    await mines.getByRole('button',{name:'Game',exact:true}).click()
    await mines.getByRole('menuitem',{name:/Expert/}).click()
    assert.equal(await mines.locator('[data-idx]').count(),480)
    await mines.locator('[data-idx="479"]').scrollIntoViewIfNeeded()
    await shot('568-mines-expert-last-cell')
    await mines.locator('[data-idx="479"]').click(); await page.keyboard.press('Home'); await page.keyboard.press('f')
    assert.equal(await mines.locator('[data-idx]:focus').getAttribute('data-idx'),'450')
    record('Expert scrolling and keyboard',await mines.locator('[data-idx]:focus').getAttribute('data-idx'))
    await launch('Solitaire')
    await cards.getByRole('button',{name:'A of diamonds',exact:true}).click()
    await cards.getByRole('button',{name:'Foundation for diamonds, empty',exact:true}).click()
    assert.match(await cards.innerText(),/1 moves/)
    await cards.getByRole('button',{name:'Undo',exact:true}).click()
    await cards.getByRole('button',{name:'Draw a card from stock'}).click()
    const cardLabels=await cards.locator('button').evaluateAll(a=>a.map(e=>e.getAttribute('aria-label')))
    await wait(page,1100);await home();const cardTime=await cards.locator('.solitaire-stats').textContent();assert.ok(cardTime && cardTime.includes('0:'));await wait(page,1300);assert.equal(await cards.locator('.solitaire-stats').textContent(),cardTime)
    await launch('Solitaire');assert.deepEqual(await cards.locator('button').evaluateAll(a=>a.map(e=>e.getAttribute('aria-label'))),cardLabels)
    await cards.getByRole('button',{name:'5 of diamonds',exact:true}).scrollIntoViewIfNeeded();await shot('568-solitaire-seventh-column')
    record('Solitaire legal move, undo, draw, Home retention',cardTime)
    }
    // Actual window resize on a desktop viewport, independent of viewport media queries.
    await page.setViewportSize({width:1440,height:900});await wait(page,1500)
    for(const [name,selector] of [['Ridgeline','.ridgeline-layout'],['Minesweeper','.mines-layout'],['Solitaire','.solitaire-layout']]) {
      await page.locator(`[data-task-app="${name.toLowerCase()}"]`).click();await wait(page)
      const frameId=await page.locator('[data-window-id]:visible').filter({has:page.locator(selector)}).last().getAttribute('data-window-id')
      const frame=page.locator(`[data-window-id="${frameId}"]`)
      const app=frame.locator(selector)
      if(name==='Ridgeline' && await app.getByRole('button',{name:'Race',exact:true}).count())await app.getByRole('button',{name:'Race',exact:true}).click()
      await shot('desktop-'+name.toLowerCase())
      const b=await frame.boundingBox()
      const handle=frame.locator('[style*="nwse-resize"]').last()
      const h=await handle.boundingBox()
      await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(b.x+560,b.y+250,{steps:12});await page.mouse.up();await wait(page)
      const actual=await app.boundingBox()
      assert.ok(actual.height<300,'window resized short on desktop')
      if(name==='Ridgeline') {
        const root=frame.getByLabel(/^Ridgeline game surface/);await root.focus();await page.keyboard.down('w');await page.keyboard.down('d');await wait(page,1700);await page.keyboard.up('d');await page.keyboard.up('w');
        await page.keyboard.press('p');assert.match(await app.innerText(),/Paused/);await page.keyboard.press('p')
      } else assert.ok((await app.locator(name==='Minesweeper'?'.mines-board':'.solitaire-scroll').boundingBox()).height>=110)
      await shot('desktop-small-'+name.toLowerCase());record('desktop window '+name,actual)
      if(name==='Minesweeper') {
        await app.getByRole('button',{name:'New game',exact:true}).click()
        const flag=app.getByRole('button',{name:/Flag mode/})
        if(await flag.getAttribute('aria-pressed')==='true') await flag.click()
        await app.locator('[data-idx="0"]').click()
      }
      if(name==='Solitaire') await app.getByRole('button',{name:'Draw a card from stock'}).click()
      await wait(page,1300)
      const timerText=()=>name==='Minesweeper'?app.getByRole('img',{name:/Seconds elapsed/,includeHidden:true}).getAttribute('aria-label'):name==='Solitaire'?app.locator('.solitaire-stats').textContent():app.locator('p.sr-only').textContent()
      if(name==='Minesweeper') assert.notEqual(await timerText(),'Seconds elapsed: 0','clock started before minimize')
      await frame.getByRole('button',{name:'Minimize',exact:true}).click()
      const pausedText=await timerText();assert.ok(pausedText && pausedText.trim());await wait(page,1400);assert.equal(await timerText(),pausedText)
      record('desktop minimize pauses '+name,pausedText)
    }
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.setViewportSize({width:568,height:320})
    await launch('Settings');await page.getByRole('button',{name:'Light',exact:true}).click()
    for(const name of ['Ridgeline','Minesweeper','Solitaire']) {await launch(name);await shot('568-light-'+name.toLowerCase())}
    record('light theme and reduced motion','rendered all three short game surfaces')
    record('browser',{version:browser.version(),errors})
    assert.deepEqual(errors,[])
  } finally {
    fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify({evidence,errors},null,2))
    await browser.close()
  }
}
run().catch(e=>{console.error(e);process.exitCode=1})
