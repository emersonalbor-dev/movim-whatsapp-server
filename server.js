import express from 'express'
import qrcodeLib from 'qrcode'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { rmSync } from 'fs'
import { createServer } from 'https'
import { get as httpGet } from 'http'
import { get as httpsGet } from 'https'

const require = createRequire(import.meta.url)
const P = require('pino')

import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'

const API_KEY = process.env.API_KEY || 'movim-secret-2024'
const PORT = process.env.PORT || 3000
const PUBLIC_URL = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL

const app = express()
app.use(express.json())

// ── Auth middleware ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path === '/qr') return next()
  const key = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '')
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })
  next()
})

// ── WhatsApp (Baileys) ─────────────────────────────────────────────────────
let sock = null
let clientReady = false
let lastQR = null

async function connectWA() {
  const { state, saveCreds } = await useMultiFileAuthState('/data/auth')
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    browser: ['MOVIM OrtoPro', 'Chrome', '1.0.0'],
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      lastQR = qr
      clientReady = false
      console.log('\n📱 QR generado — visita /qr para escanear\n')
    }

    if (connection === 'open') {
      clientReady = true
      lastQR = null
      console.log('✅ WhatsApp conectado y listo!')
    }

    if (connection === 'close') {
      clientReady = false
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
      console.log('❌ Desconectado, razón:', reason)
      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(connectWA, 5000)
      } else {
        rmSync('/data/auth', { recursive: true, force: true })
        setTimeout(connectWA, 3000)
      }
    }
  })
}

connectWA()

// Self-ping every 10 min
if (PUBLIC_URL) {
  setInterval(() => {
    const getter = PUBLIC_URL.startsWith('https') ? httpsGet : httpGet
    getter(`${PUBLIC_URL}/api/health`, () => {}).on('error', () => {})
  }, 10 * 60 * 1000)
}

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: clientReady ? 'ready' : 'initializing' })
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
      <h2>⏳ Generando QR...</h2><p>Espera unos segundos y recarga.</p>
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
      <script>setTimeout(()=>location.reload(),20000)</script>
    </body></html>`)
  } catch {
    res.send('<h2>Error generando QR. Recarga.</h2>')
  }
})

app.post('/api/sessions/:sessionId/messages/send-text', async (req, res) => {
  if (!clientReady || !sock) return res.status(503).json({ error: 'WhatsApp no conectado. Visita /qr.' })
  const { chatId, text } = req.body
  if (!chatId || !text) return res.status(400).json({ error: 'chatId y text son requeridos' })
  try {
    await sock.sendMessage(chatId, { text })
    res.json({ success: true })
  } catch (err) {
    console.error('[send-text]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/sessions', (req, res) => {
  res.json([{ id: 'movim', status: clientReady ? 'CONNECTED' : 'INITIALIZING' }])
})

app.listen(PORT, () => {
  console.log(`\n🚀 MOVIM WhatsApp Server (Baileys) en puerto ${PORT}`)
  if (PUBLIC_URL) console.log(`   URL pública: ${PUBLIC_URL}`)
  console.log('   Inicializando...\n')
})
