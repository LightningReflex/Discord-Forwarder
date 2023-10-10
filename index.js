const chalk = require('chalk');
const axios = require('axios');

const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
] });

const config = require('./config.js');

let channelsMap = {};
let webhooksMap = {};

const webhookRegex = /^https:\/\/(?:canary|ptb)?\.?discord(?:app)?\.com\/api\/webhooks\/(\d+)\/([a-zA-Z0-9-_]+)$/;

let ready = false;

client.on('ready', async () => {
  for (const [keyId, valueIds] of Object.entries(config.MAP)) {
    // Check if they are a webhook ID or a channel ID
    await client.channels.fetch(keyId).then(async channel => {
      if (channel.isTextBased()) {

        // It's a channel
        console.log(chalk.green(`\nChannel ${channel.name} (${channel.id})`));
        for (const valueId of valueIds) {
          // Check if they are a webhook URL or a channel ID
          if (webhookRegex.test(valueId)) {
            await axios.get(valueId).then(res => {
              console.log(chalk.green(`  |-> Redirect to webhook ${res.data.name} (${res.data.id})`));
              channelsMap[keyId] = channelsMap[keyId] || [];
              channelsMap[keyId].push(valueId);
            }).catch(err => {
              console.log(chalk.red(`  |-> Unknown webhook: ${valueId}`));
            });
          } else {
            await client.channels.fetch(valueId).then(valueChannel => {
              if (valueChannel.isTextBased()) {
                console.log(chalk.green(`  |-> Redirect to channel: ${valueChannel.name} (${valueChannel.id})`));
                channelsMap[keyId] = channelsMap[keyId] || [];
                channelsMap[keyId].push(valueId);
              } else {
                console.log(chalk.red(`  |-> Unknown channel type: ${valueChannel.type} (${valueChannel.id})`));
              }
            }).catch(err => {
              console.log(chalk.red(`  |-> Unknown channel/webhook: ${valueId}`));
            });
          }
        }

      } else {
        console.log(chalk.red(`  |-> Unknown channel type: ${channel.type} (${channel.id})`));
      }

    }).catch(async err => {
      // Possibly a webhook ID
      // console.log(chalk.yellow(`\nAssuming ${keyId} is a webhook ID: ${err}`));
      await axios.get(keyId).then(async res => {
        console.log(chalk.green(`\nWebhook ${res.data.name} (${res.data.id})`));
        // webhooksMap[keyId] = valueIds;
        for (const valueId of valueIds) {
          // Check if they are a webhook URL or a channel ID
          if (webhookRegex.test(valueId)) {
            await axios.get(valueId).then(res2 => {
              console.log(chalk.green(`  |-> Redirect to webhook ${res2.data.name} (${res2.data.id})`));
              webhooksMap[res.data.id] = webhooksMap[res.data.id] || [];
              webhooksMap[res.data.id].push(valueId);
            }).catch(err => {
              console.log(chalk.red(`  |-> Unknown webhook: ${valueId}`));
            });
          } else {
            await client.channels.fetch(valueId).then(valueChannel => {
              if (valueChannel.isTextBased()) {
                console.log(chalk.green(`  |-> Redirect to channel ${valueChannel.name} (${valueChannel.id})`));
                webhooksMap[res.data.id] = webhooksMap[res.data.id] || [];
                webhooksMap[res.data.id].push(valueId);
              } else {
                console.log(chalk.red(`  |-> Unknown channel type: ${valueChannel.type} (${valueChannel.id})`));
              }
            }).catch(err => {
              console.log(chalk.red(`  |-> Unknown channel: ${valueId}`));
            });
          }
        }
      }).catch(err => {
        console.log(chalk.red(`  |-> Unknown channel/webhook: ${keyId}`));
      });
    });
  }
  console.log(chalk.green(`\nLogged in as ${client.user.tag}!`));
  ready = true;
});

client.on('messageCreate', msg => {
  if (!ready) return;
  // if (msg.webhookId) {
  //   console.log(chalk.blue(`Message from ${msg.author.tag}: ${JSON.stringify(msg)}`));
  //   // msg.reply(`Caught: "${msg.content}"`);
  //   msg.channel.send(`Caught: "${msg.content}"`);
  // }

  // If it's in the webhook map, send it to the channels/webhooks
  // If it's in the channel map, send it to the channels/webhooks
  // If not found, ignore it
  // console.log(chalk.blue(`Message from ${msg.author.tag}: ${JSON.stringify(msg)}`));
  // console.log(chalk.blue(`  |-> Webhook ID: ${msg.webhookId}`));
  // console.log(chalk.blue(`  |-> Channel ID: ${msg.channel.id}`));
  // console.log(JSON.stringify(webhooksMap));
  if (webhooksMap[msg.webhookId]) {
    // console.log(chalk.blue(`  |-> Redirecting to ${msg.webhookId}`));
    for (const valueId of webhooksMap[msg.webhookId]) {
      // console.log(chalk.blue(`  |-> Redirecting to ${valueId}`));
      if (webhookRegex.test(valueId)) {
        // console.log(chalk.blue(`  |-> It's a webhook`));
        // It's a webhook
        console.log(chalk.blue(`Redirecting message from webhook ${msg.author.tag} (${msg.webhookId}) to webhook ${valueId}`));
        axios.post(valueId, {
          content: msg.content,
          embeds: msg.embeds,
          username: msg.author.username,
          avatar_url: msg.author.avatarURL(),
        }).catch(err => {
          console.log(chalk.red(`  |-> Unknown webhook: ${valueId}`));
        });
      } else {
        // console.log(chalk.blue(`  |-> It's a channel`));
        // It's a channel
        client.channels.fetch(valueId).then(channel => {
          if (channel.isTextBased()) {
            // channel.send(msg.content, {
            //   embeds: msg.embeds,
            //   username: msg.author.username,
            //   avatarURL: msg.author.avatarURL(),
            // });
            console.log(chalk.blue(`Redirecting message from webhook ${msg.author.tag} (${msg.webhookId}) to channel ${channel.name} (${channel.id})`));
            channel.createWebhook({
              name: msg.author.username,
              avatar: msg.author.avatarURL(),
              reason: `Redirected from webhook ${msg.webhookId}`,
            }).then(webhook => {
              webhook.send(msg.content, {
                embeds: msg.embeds,
              }).then(() => {
                webhook.delete();
              });
            });
          } else {
            console.log(chalk.red(`  |-> Unknown channel type: ${channel.type} (${channel.id})`));
          }
        }).catch(err => {
          console.log(chalk.red(`  |-> Unknown channel: ${valueId}`));
        });
      }
      console.log(chalk.blue(`  |-> Redirected to ${valueId}`));
    }
  } else if (channelsMap[msg.channel.id]) {
    for (const valueId of channelsMap[msg.channel.id]) {
      if (webhookRegex.test(valueId)) {
        // It's a webhook
        console.log(chalk.blue(`Redirecting message from channel ${msg.channel.name} (${msg.channel.id}) to webhook ${valueId}`));
        axios.post(valueId, {
          content: msg.content,
          embeds: msg.embeds,
          username: msg.author.username,
          avatar_url: msg.author.avatarURL(),
        }).catch(err => {
          console.log(chalk.red(`  |-> Unknown webhook: ${valueId}`));
        });
      } else {
        // It's a channel
        client.channels.fetch(valueId).then(channel => {
          if (channel.isTextBased()) {
            // channel.send(msg.content, {
            //   embeds: msg.embeds,
            //   username: msg.author.username,
            //   avatarURL: msg.author.avatarURL(),
            // });
            console.log(chalk.blue(`Redirecting message from channel ${msg.channel.name} (${msg.channel.id}) to channel ${channel.name} (${channel.id})`));
            channel.createWebhook({
              name: msg.author.username,
              avatar: msg.author.avatarURL(),
              reason: `Redirected from channel ${msg.channel.id}`,
            }).then(webhook => {
              webhook.send(msg.content, {
                embeds: msg.embeds,
              }).then(() => {
                webhook.delete();
              });
            });
          } else {
            console.log(chalk.red(`  |-> Unknown channel type: ${channel.type} (${channel.id})`));
          }
        }).catch(err => {
          console.log(chalk.red(`  |-> Unknown channel: ${valueId}`));
        });
      }
    }
  }
});

client.login(config.TOKEN);