const { EmbedBuilder,
	ButtonBuilder,
	ActionRowBuilder,
	bold,
	ChannelType,
	userMention,
	ButtonStyle,
} = require('discord.js');
const PastRaffle = require('../../schemas/raffles/past-raffle-schema');
const getWinners = require('../../utils/raffles/getWinners');
const convertWinnerArrayToMentions = require('../../utils/raffles/convertWinnerArrayToMentions');
const getOriginalRaffleMessage = require('../../utils/raffles/getOriginalRaffleMessage');
const resolveGuildMember = require('../../utils/raffles/resolveGuildMember');
const SovBot = require('../../index');


async function disableRaffleMessageComponents(originalRaffleMessage) {
	const oldButton = originalRaffleMessage.components[0].components[0];

	const newButton = ButtonBuilder.from(oldButton)
		.setDisabled(true);

	const row = new ActionRowBuilder()
		.addComponents(newButton);

	await originalRaffleMessage.edit({
		components: [row],
	});
}

function updateWinners(oldEmbedDescription, mentionsOfWinners) {
	const regex = new RegExp('Winners: \\*\\*[0-9]\\*\\*+');

	return oldEmbedDescription.replace(regex, `Winners: ${mentionsOfWinners}`);
}

async function editRaffleMessage(originalRaffleMessage, mentionsOfWinners) {
	await disableRaffleMessageComponents(originalRaffleMessage);

	const oldEmbed = originalRaffleMessage.embeds[0];

	const newDescription = updateWinners(oldEmbed.description, mentionsOfWinners);

	const newEmbed = EmbedBuilder.from(oldEmbed)
		.setDescription(newDescription);

	await originalRaffleMessage.edit({ embeds: [newEmbed] });
}

async function migrateRaffleDocument(oldRaffleDoc, winners) {
	const doc = new PastRaffle({
		_id: oldRaffleDoc._id,
		channelId: oldRaffleDoc.channelId,
		prize: oldRaffleDoc.prize,
		description: oldRaffleDoc.description,
		date: oldRaffleDoc.date,
		noOfWinners: oldRaffleDoc.noOfWinners,
		entries: oldRaffleDoc.entries,
		winners: winners,
	});

	await doc.save()
		.catch(console.error)
		.then(await oldRaffleDoc.deleteOne()).catch(console.error);
}

function createPrivateThreadButtons() {
	const vodInformationButton = new ButtonBuilder()
		.setCustomId('thread-set-vod-information-button')
		.setLabel('Set VOD Information')
		.setStyle(ButtonStyle.Secondary);

	const calendlyButton = new ButtonBuilder()
		.setLabel('Schedule Session')
		.setStyle(ButtonStyle.Link)
		.setURL('https://calendly.com/sovereignguides/free-coaching');

	const createEvent = new ButtonBuilder()
		.setCustomId('thread-create-event-button')
		.setLabel('Create Event!')
		.setEmoji('🎉')
		.setStyle(ButtonStyle.Success);

	return new ActionRowBuilder().addComponents(vodInformationButton, calendlyButton, createEvent);
}

async function createPrivateThreads(raffle, arrayOfWinners, originalRaffleMessage) {
	const guild = originalRaffleMessage.guild;

	for (const winner of arrayOfWinners) {
		const guildMember = await resolveGuildMember(winner._id, guild);
		if (!guildMember) {
			continue;
		}

		const thread = await originalRaffleMessage.channel.threads.create({
			name: (guildMember.nickname ?? guildMember.user.username) + ` (${guildMember.user.id}) ` + ' — ' + raffle._id,
			type: ChannelType.PrivateThread,
			invitable: false,
		});

		const buttonRow = createPrivateThreadButtons();
		await thread.send({
			content: `Congrats ${userMention(guildMember.id)}, you won ${bold(raffle.prize)}! `
				+ 'Now, please follow these next steps using the first two buttons below. After, a server staff will create an event!\n\n'
				+ '1. Enter details surrounding your VOD submitted!.\n'
				+ '2. Schedule your session with Airen using the Calendly link!\n\n'
				+ `🔎 What is the particular focus? ${winner.focus}\n`
				+ `🔗 The YouTube link to your VOD? ${winner.vodLink}`,
			components: [buttonRow],
		}).then(m => m.pin());
	}
}


module.exports = async function handleRaffleEnd(raffle) {
	const messageId = raffle._id;
	const { channelId, prize, noOfWinners, entries } = raffle;

	const channel = await SovBot.SovBot.channels.cache.get(channelId);
	const guild = channel.guild;

	const arrayOfWinners = await getWinners(entries, guild, noOfWinners);

	await migrateRaffleDocument(raffle, arrayOfWinners);

	const mentionsOfWinners = convertWinnerArrayToMentions(arrayOfWinners);

	const originalRaffleMessage = await getOriginalRaffleMessage(messageId, channel)
		.catch(e => console.error(e.code));
	if (!originalRaffleMessage) {
		return console.error('Raffle Deleted!', raffle);
	}

	await editRaffleMessage(originalRaffleMessage, mentionsOfWinners);

	await originalRaffleMessage.reply({
		content: `Congratulations ${mentionsOfWinners}! You won the ${bold(prize)}!`,
	});

	await createPrivateThreads(raffle, arrayOfWinners, originalRaffleMessage);
};
