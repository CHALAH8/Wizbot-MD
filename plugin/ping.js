const { cmd } = require('../lib/command')

cmd({
    pattern: 'ping',
    react: "🚀",
    category: 'general',
},
async(xtroid, x, m, { from, reply }) => {
    try {
    const startTime = Date.now()
    const message = await xtroid.sendMessage(from, { text: '🔃Pinging...' })
    const endTime = Date.now()
    const ping = endTime - startTime
    await xtroid.sendMessage(from, { text: `*❄️ Bot Speed... : ${ping}ms*` }, { quoted: message })
    } catch (e) {
        console.log(e)
        reply(`${e}`)
    }
})
