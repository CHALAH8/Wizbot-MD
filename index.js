const config = require("./config");
const { makeWASocket, downloadMediaMessage, useMultiFileAuthState, downloadContentFromMessage, Browsers, getContentType, jidNormalizedUser, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidDecode, DisconnectReason, makeInMemoryStore } = require("baileys")
const pino = require("pino")
const { Boom } = require('@hapi/boom')
const path = require('path')
const axios = require('axios')
const { color } = require('./lib/color')
const { sms, getGroupAdmins } = require('./lib/msg')
const fs = require('fs')

const sessionDir = path.join(__dirname, 'auth_info_baileys');
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}



const store = makeInMemoryStore({
    logger: pino().child({
        level: 'silent',
        stream: 'store'
    })
})

async function connectWA() {
    let { version, isLatest } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
    console.log(`☠️ using WA v${version.join('.')}, isLatest: ${isLatest}`);
    
    const xtroid = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: Browsers.macOS("Desktop"),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true
    })

    store.bind(xtroid.ev)

    xtroid.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update

        try {
            if (connection === 'close') { 
                let reason = new Boom(lastDisconnect?.error)?.output.statusCode
                if (reason === DisconnectReason.badSession) {
                    console.log(`Bad Session File, Please Delete Session and Scan Again`);
                    connectWA()
                }else if (reason === DisconnectReason.connectionClosed) {
                    console.log("Connection closed, reconnecting....");
                    connectWA();
                } else if (reason === DisconnectReason.connectionLost) {
                    console.log("Connection Lost from Server, reconnecting...");
                    connectWA();
                } else if (reason === DisconnectReason.connectionReplaced) {
                    console.log("Connection Replaced, Another New Session Opened, reconnecting...");
                    connectWA();
                } else if (reason === DisconnectReason.loggedOut) {
                    console.log(`Device Logged Out, Please Delete Session and Scan Again.`);
                    connectWA();
                } else if (reason === DisconnectReason.restartRequired) {
                    console.log("Restart Required, Restarting...");
                    connectWA();
                } else if (reason === DisconnectReason.timedOut) {
                    console.log("Connection TimedOut, Reconnecting...");
                    connectWA();
                } else xtroid.end(`Unknown DisconnectReason: ${reason}|${connection}`) 
            }

            if (update.connection == "connecting" || update.receivedPendingNotifications == "false") {
                console.log(color(`\n🌿 Connecting...`, 'yellow'))
            }

            if (update.connection == "open" || update.receivedPendingNotifications == "true") {
                fs.readdirSync("./plugins/").forEach((plugin) => {
                if (path.extname(plugin).toLowerCase() == ".js") {
                require("./plugins/" + plugin);
                }})

                console.log(color(`🌿 Connected to => ` + JSON.stringify(xtroid.user, null, 2), 'blue'))
                await xtroid.sendMessage('94764497078@s.whatsapp.net', { text: 'Connected Successfully ✅\n\nJoin For Updates\n*https://whatsapp.com/channel/0029VawMiVT9Gv7NTdq9jB1e*' });
              
            }    
        } catch(e) {
        console.log('Error in Connection.update '+ e.message)
        connectWA()
        }
    })

  

    xtroid.ev.on('creds.update', saveCreds)
    xtroid.ev.on("messages.upsert", async XChats => { 
        try {
            //console.log(JSON.stringify(XChats, undefined, 2))

            x = XChats.messages[0]
            if (!x.message) return

            x.message = (Object.keys(x.message)[0] === 'ephemeralMessage') ? x.message.ephemeralMessage.message : x.message
            if (x.key.id.startsWith('xtroid') && x.key.id.length === 16) return
            if (x.key.id.startsWith('BAE5')) return
            const m = await sms(xtroid, x)

            const prefix = config.PREFIX
            const from = x.key.remoteJid
            const type = getContentType(x.message)
            const body = (type === 'conversation') ? x.message.conversation : (type === 'extendedTextMessage') ? x.message.extendedTextMessage.text : (type == 'imageMessage') && x.message.imageMessage.caption ? x.message.imageMessage.caption : (type == 'videoMessage') && x.message.videoMessage.caption ? x.message.videoMessage.caption : ''
            const isCmd = body.startsWith(prefix)
            const args = body.trim().split(/ +/).slice(1)
            const text = args.join(' ')
            const sender = x.key.fromMe ? (xtroid.user.id.split(':')[0]+'@s.whatsapp.net' || xtroid.user.id) : (x.key.participant || x.key.remoteJid)
            const senderNumber = sender.split('@')[0]
            const botNumber = xtroid.user.id.split(':')[0]
            const pushName = x.pushName || 'Nimesh Piyumal'
            const isMe = botNumber.includes(senderNumber)
            const isOwner = config.OWNER_NUMBER.includes(senderNumber) || isMe

            const reply = (teks) => {
                xtroid.sendMessage(from, { text: teks, contextInfo: {
                  forwardingScore: 9999999,
                  isForwarded: true,
                }}, { quoted: x })
            }

            const events = require('./lib/command')
            const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false;

            if (isCmd) {
            const cmd = events.commands.find((cmd) => cmd.pattern === (cmdName)) || events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName))
            if (cmd) {
            if (cmd.react) xtroid.sendMessage(from, { react: { text: cmd.react, key: x.key }})
                
            try {
            cmd.function(xtroid, x, m,{from, args, text, sender, isOwner, pushName, reply});
            } catch (e) {
                console.error("[ COMMAND ERROR] " + e);
            }}}

       

            events.commands.map(async(command) => {
                if (body && command.on === "body") {
                command.function(xtroid, x, m,{from, args, text, sender, isOwner, pushName, reply })
                } else if (x.q && command.on === "text") {
                command.function(xtroid, x, m,{from, args, text, sender, isOwner, pushName, reply})
                } else if (
                (command.on === "image" || command.on === "photo") &&
                x.type === "imageMessage"
                ) {
                command.function(xtroid, x, m,{from, args, text, sender, isOwner, pushName, reply})
                } else if (
                command.on === "sticker" &&
                x.type === "stickerMessage"
                ) {
                command.function(xtroid, x, m,{from, args, text, sender, isOwner, pushName, reply})
            }});
            
        } catch (error) {
            console.error('Error reacting to status:', error);
        }
    })
}
async function init() {
    if (fs.existsSync(credsPath)) {
        console.log("🛠️ Session ID found📛");
        connectWA();
    } else {
        const sessionDownloaded = await downloadSessionData();
        if (sessionDownloaded) {
            console.log("🔑 Session downloaded, starting bot.�🔓");
            connectWA()
        } else {
            console.log("🔐No session found or downloaded⚙️");
            connectWA()
        }
    }
  }
  init();
