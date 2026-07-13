const handler = async (m, { conn }) => {
    await conn.sendMessage(m.chat, { text: 'bot aktif' }, { quoted: m });
};

handler.help = ['tes'];
handler.tags = ['core'];
handler.command = /^(tes)$/i;

module.exports = handler;
