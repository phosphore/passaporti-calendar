const http = require('http')
const url = require('url')
const puppeteer = require('puppeteer')
const qs = require('qs')
const moment = require('moment')
const ical = require('ical-generator')

const {CODICE_FISCALE, PASSWORD} = process.env


const cal = ical({
    domain: 'www.passaportonline.poliziadistato.it',
    name: 'Passaporto Elettronico',
    ttl: 60 * 60 /* 1 hour*/
  })
  
http.createServer((req, res) => serveCalendar(res)).listen(process.env.PORT || 3000)

const serveCalendar = async res => {
    const links = await loadLinks()
    const events = createEvents(links)

    cal.events().length = 0
    cal.events(events)
    cal.serve(res)
}
  
const loadLinks = async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  await page.goto('https://www.passaportonline.poliziadistato.it/logInCittadino.do')
  await page.type('#codiceFiscale', CODICE_FISCALE)
  await page.type('#password', PASSWORD)
  await Promise.all([
    page.waitForNavigation(),
    page.click('input[type=submit]')
  ]) 

  await page.goto('https://www.passaportonline.poliziadistato.it/GestioneCalendarioCittadinoAction.do?codop=mostraCalendario&idRegista=201', {waitUntil: 'networkidle0'})
  
  const links = []

  while(true) {
    const free = await page.$$('.free')

    links.push(...await Promise.all(free.map(async f => (await f.getProperty('href')).jsonValue())))

    if(!await page.$('.meseSuccessivo')) break

    await Promise.all([
        page.waitForNavigation({waitUntil: 'networkidle0'}),
        page.click('.meseSuccessivo')
    ])
  }

  await browser.close()
  return links
}

const createEvents = links => {
  const parsedLinks = links.map(l => qs.parse(url.parse(l).query))

  const events = parsedLinks.map(l => {
    const date = moment(`${l.data} ${l.orario}`, 'DD-MM-YYYY HH.mm')

    return {
        start: date.toDate(),
        end: date.add(1, 'hour').toDate(),
        summary: `Disponibilità Passaporto ${l.disponibilita}`
    }
  })


  return events
}