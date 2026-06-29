// Starts the WhatsApp server + opens a public tunnel via localtunnel
// Run: node tunnel.js
const { spawn } = require('child_process')
const localtunnel = require('localtunnel')

const PORT = process.env.PORT || 2785
const API_KEY = process.env.API_KEY || 'movim-secret-2024'

// Start the WA server in the same process
require('./server.js')

// Wait a bit then open tunnel
setTimeout(async () => {
  try {
    const tunnel = await localtunnel({ port: PORT, subdomain: 'movim-wa' })
    console.log('\n🌐 ====================================')
    console.log('   URL PÚBLICA (para Vercel):')
    console.log(`   ${tunnel.url}`)
    console.log('   ====================================')
    console.log(`\n   Copia esta URL a Vercel como OPENWA_URL`)
    console.log(`   OPENWA_API_KEY = ${API_KEY}`)
    console.log(`   OPENWA_SESSION = movim\n`)

    tunnel.on('close', () => {
      console.log('⚠️  Túnel cerrado. Reinicia con: node tunnel.js')
    })

    tunnel.on('error', (err) => {
      console.error('❌ Error en túnel:', err.message)
    })
  } catch (err) {
    console.error('❌ No se pudo abrir túnel:', err.message)
    console.log('   Usa la IP local si Vercel está en la misma red.')
  }
}, 3000)
