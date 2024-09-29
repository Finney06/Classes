require("dotenv").config();
const qrcode = require("qrcode-terminal");
const { Client, RemoteAuth, MessageMedia } = require("whatsapp-web.js");
const { MongoStore } = require("wwebjs-mongo");
const mongoose = require("mongoose");

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log("Connected to MongoDB");

  // Set up MongoStore for RemoteAuth
  const store = new MongoStore({ mongoose });

  const client = new Client({
    authStrategy: new RemoteAuth({
      store: store,
      backupSyncIntervalMs: 300000, // Sync session backup every 5 minutes
    }),
  });

  const adminNumber = process.env.ADMIN_NUMBER; // Admin's WhatsApp ID

  // QR Code event
  client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
  });

  // Client ready event
  client.on("ready", () => {
    console.log("Client is ready!");
    sendAdminMessage('The WhatsApp bot is now ready and running.');
    sendBirthdayMessages();
  });

  // Handle disconnection
  client.on("disconnected", (reason) => {
    console.log("Bot was disconnected. Reason:", reason);
    sendAdminMessage(`The bot was disconnected. Reason: ${reason}`);
  });

  // Remote session saved event
  client.on("remote_session_saved", () => {
    console.log("Remote session has been saved.");
   
     try {
      console.log('Shutting down the client...');
      await sendAdminMessage('The bot is shutting down after task completion.');
      
      // Optional: Close other connections like MongoDB
      await mongoose.disconnect(); 
  
      // Delay only the exit process by 60 seconds
      setTimeout(() => {
        console.log('Exiting the process...');
        process.exit(0); // Shut down the client after task completion
      }, 60000); // 60 seconds delay
      
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  });

  // Initialize WhatsApp client
  client.initialize();

  const birthdayMessages = require("./birthdayMessages.js");

 // Function to fetch Airtable records and send birthday messages
async function sendBirthdayMessages() {
  try {
      const airtableApiKey = process.env.AIRTABLE_API_KEY; 
      const baseId = process.env.AIRTABLE_BASE_ID; 
      const tableName = process.env.AIRTABLE_TABLE_ID; 
      const groupNumber = process.env.GROUP_CHAT_ID; // Group Chat ID for WhatsApp Group
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

              // Send to individual user
              if (picture) {
                  await sendMedia(whatsappNumber, picture, directMessage);
              } else {
                  await sendMessage(whatsappNumber, directMessage);
              }

              // Personalized message for the group
              const groupMessage = `${randomMessage} Happy Birthday @${user.whatsappNumber}! 🎉🎂`;

              if (picture) {
                  await sendMedia(groupNumber, picture, groupMessage, [whatsappNumber]);
              } else {
                  await sendMessage(groupNumber, groupMessage, [whatsappNumber]);
              }
          }
      }

      if (!messagesSent) {
          console.log('No birthdays today.');
          sendAdminMessage('No birthdays to celebrate today.');
      } else {
          console.log('All messages sent.');
          sendAdminMessage('All birthday messages have been sent.');
      }

 // 1 minute delay before shutting down the client
      
  } catch (error) {
      console.error('Error:', error);
      sendAdminMessage(`Error encountered while sending birthday messages: ${error.message}`);
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
      sendAdminMessage(`Failed to send media to ${targetNumber}: ${error.message}`);
  }
}

// Function to send a plain message with mention
async function sendMessage(targetNumber, message, mentions = []) {
  try {
      await client.sendMessage(targetNumber, message, { mentions });
      console.log(`Message sent successfully to ${targetNumber}`);
  } catch (error) {
      console.error('Error sending message:', error);
      sendAdminMessage(`Error sending message to ${targetNumber}: ${error.message}`);
  }
}

// Function to send logs and updates to the admin
async function sendAdminMessage(message) {
  try {
      await client.sendMessage(adminNumber, message);
      console.log(`Notification sent to admin: ${message}`);
  } catch (error) {
      console.error('Failed to notify admin:', error);
  }
}

});
