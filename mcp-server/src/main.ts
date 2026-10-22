import 'dotenv/config'
import { createApp } from './app.js'

const PORT = Number(process.env.PORT ?? 4006)
createApp().listen(PORT, () => { console.log(`mcp-server listening on :${PORT}`) })
