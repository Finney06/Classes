require('dotenv').config();
//const fetch = require('node-fetch');

const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
// const fs = require('fs');

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
    sendBirthdayMessages();
});

client.on('disconnected', (reason) => {
    console.log('Bot was disconnected. Reason:', reason);

    // Send a WhatsApp message to yourself or an admin
    client.sendMessage(adminNumber, `The bot was disconnected. Reason: ${reason}`);
});

// Start the WhatsApp client
client.initialize();

const birthdayMessages = require('./birthdayMessages.js');
const adminNumber = process.env.ADMIN_NUMBER;

// Function to fetch Airtable records and send birthday messages
async function sendBirthdayMessages() {
    try {
        const airtableApiKey = process.env.AIRTABLE_API_KEY; 
        const baseId = process.env.AIRTABLE_BASE_ID; 
        const tableName = process.env.AIRTABLE_TABLE_ID; 
        const groupNumber =  process.env.GROUP_CHAT_ID;
        const apiUrl = `https://api.airtable.com/v0/${baseId}/${tableName}`;

        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${airtableApiKey}`
            }
        });

        if (!response.ok) {
            throw new Error('Error fetching data from Airtable');
        }

        const data = await response.json();

        const userInput = data.records.map(record => {
            const fields = record.fields;
            return {
                name: fields.Name,
                whatsappNumber: fields['Whatsapp Number'],
                nickname: fields.Nickname,
                dateOfBirth: fields['Date of Birth'],
                picture: fields.Picture && fields.Picture[0] && fields.Picture[0].url // Ensure Picture URL exists
            };
        });

        // console.

        // Get today's date
        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDay = today.getDate();

        // Initialize message tracking flag
        let messagesSent = false;

        // Iterate through users to find whose birthday it is
        for (let user of userInput) {
            const dobMonth = user.dateOfBirth.split('-')[1];
            const dobDay = user.dateOfBirth.split('-')[2];
            const whatsappNumber = `${user.whatsappNumber}@c.us`;  // Create user's WhatsApp ID
            const picture = user.picture;
            const nickname = user.nickname;
            // const userName = user.name; 

            if (parseInt(dobMonth) === todayMonth && parseInt(dobDay) === todayDay) {
                console.log(`Today is ${user.name}'s birthday!`);
                messagesSent = true;  // Set to true when a message is being sent

                // Select a random message from the external birthday messages array
                const randomMessage = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];
                if (!randomMessage) {
                    throw new Error('Random message could not be selected from birthdayMessages array');
                }

                console.log(`Random message selected: ${randomMessage}`);

                // Personalized message for DM
                const directMessage = `${randomMessage} Happy Birthday, ${nickname}! 🎉🎁`;
                // console.log(directMessage)


                // Send to individual user
                if (picture) {
                    await sendMedia(whatsappNumber, picture, directMessage);
                } else {
                    await sendMessage(whatsappNumber, directMessage);
                }

                // Personalized message for the group
                const groupMessage = `${randomMessage} Happy Birthday @${user.whatsappNumber}! 🎉🎂`;
                // console.log(groupMessage)


                if (picture) {
                    await sendMedia(groupNumber, picture, groupMessage, [whatsappNumber]);
                } else {
                    await sendMessage(groupNumber, groupMessage, [whatsappNumber]);
                }
            }
        }

        if (!messagesSent) {
            console.log('No birthdays today.');
        } else {
            console.log('All messages sent.');
        }

        setTimeout(() => {
            console.log('Shutting down the client...');
            client.destroy();
        }, 60000);  // 1 minute delay before destroying the client
        
    } catch (error) {
        console.error('Error:', error);
    }
}

// Function to send media directly from URL with mention
async function sendMedia(targetNumber, picture, message, mentions = []) {
    try {
        const media = await MessageMedia.fromUrl(picture, { unsafeMime: true });  // Fetch media from the URL
        await client.sendMessage(targetNumber, media, { caption: message, mentions });  // Send media with caption and mention
        console.log(`Media sent successfully to ${targetNumber}`);
    } catch (error) {
        console.error(`Failed to send message to:`, error);
          // Notify yourself/admin on failure
            //  await client.sendMessage(adminNumber, `Failed to send birthday message to ${userName}. Error: ${error.message}`);
    }
}

// Function to send a plain message with mention
async function sendMessage(targetNumber, message, mentions = []) {
    try {
        await client.sendMessage(targetNumber, message, { mentions });
        console.log(`Message sent successfully to ${targetNumber}`);
    } catch (error) {
        console.error('Error sending message:', error);
         // Notify yourself/admin on failure
            //  await client.sendMessage(adminNumber, `Failed to send birthday message to ${userName}. Error: ${error.message}`);
    }
}
