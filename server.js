const { Client, LocalAuth } = require('whatsapp-web.js')
const qrcode = require('qrcode-terminal')
const qrcodeLib = require('qrcode')
const express = require('express')

const API_KEY = process.env.API_KEY || 'movim-secret-2024'
const PORT = process.env.PORT || 2785
const SESSION = process.env.SESSION_ID || 'movim'

const app = express()
app.use(express.json())

// ── Auth middleware ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path === '/qr') return next()
  const key = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '')
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })
  next()
})

// ── WhatsApp client ────────────────────────────────────────────────────────
let clientReady = false
let lastQR = null

const client = new Client({
  authStrategy: new LocalAuth({ clientId: SESSION, dataPath: '/data/.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
    ],
  },
})

client.on('qr', (qr) => {
  lastQR = qr
  console.log('\n📱 ESCANEA ESTE QR CON WHATSAPP:\n')
  qrcode.generate(qr, { small: true })
  console.log('\nO visita: /qr en el navegador\n')
})

client.on('ready', () => {
  clientReady = true
  lastQR = null
  console.log('✅ WhatsApp conectado y listo!')
})

client.on('disconnected', (reason) => {
  clientReady = false
  console.log('❌ WhatsApp desconectado:', reason)
  setTimeout(() => client.initialize(), 5000)
})

client.initialize()

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: clientReady ? 'ready' : 'initializing', session: SESSION })
})

app.get('/qr', async (req, res) => {
  if (clientReady) {
    return res.send(`<html><body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;padding:40px;background:#f0fdf4">
      <h2 style="color:#16a34a">✅ WhatsApp conectado!</h2>
      <p>El servidor está listo para enviar mensajes.</p>
    </body></html>`)
  }
  if (!lastQR) {
    return res.send(`<html><body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;padding:40px">
      <h2>⏳ Generando QR...</h2>
      <p>Espera unos segundos y recarga.</p>
      <script>setTimeout(()=>location.reload(),4000)</script>
    </body></html>`)
  }
  try {
    const qrDataUrl = await qrcodeLib.toDataURL(lastQR, { width: 300, margin: 2 })
    res.send(`<html><body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;padding:40px">
      <h2>📱 Escanea con WhatsApp</h2>
      <img src="${qrDataUrl}" style="border:2px solid #ccc;border-radius:8px;width:300px;height:300px" />
      <p style="color:#666;margin-top:16px;text-align:center">
        Abre WhatsApp → ⋮ → <strong>Dispositivos vinculados</strong> → <strong>Vincular dispositivo</strong>
      </p>
      <p style="color:#999;font-size:12px">Esta página se actualiza cada 30 segundos</p>
      <script>setTimeout(()=>location.reload(),30000)</script>
    </body></html>`)
  } catch {
    res.send('<h2>Error generando QR. Recarga.</h2>')
  }
})

// Send text — compatible with rmyndharis/OpenWA REST API
app.post('/api/sessions/:sessionId/messages/send-text', async (req, res) => {
  if (!clientReady) return res.status(503).json({ error: 'WhatsApp no conectado. Escanea el QR primero.' })
  const { chatId, text } = req.body
  if (!chatId || !text) return res.status(400).json({ error: 'chatId y text son requeridos' })
  try {
    const msg = await client.sendMessage(chatId, text)
    res.json({ success: true, messageId: msg.id._serialized })
  } catch (err) {
    console.error('[send-text] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/sessions', (req, res) => {
  res.json([{ id: SESSION, status: clientReady ? 'CONNECTED' : 'INITIALIZING' }])
})

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 MOVIM WhatsApp Server en puerto ${PORT}`)
  console.log(`   QR page: /qr`)
  console.log('   Inicializando WhatsApp...\n')
})
