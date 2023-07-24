const { SlashCommandBuilder,
	PermissionFlagsBits,
	ChannelType,
	time,
	EmbedBuilder,
	bold,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
} = require('discord.js');
const validateDate = require('../utils/validateDate');
const UpcomingRaffle = require('../schemas/upcoming-raffle-schema');


function createRaffleEmbed(prize, description, date, noOfWinners) {
	if (description) {
		description = description + '\n' + '\n';
	}
	else {
		description = '';
	}

	return new EmbedBuilder()
		.setColor(0x15af98)
		.setTitle(`:confetti_ball: ${prize}`)
		.setDescription(`${description}Ends: ${time(date, 'R')} (${time(date, 'F')})\nEntries: ${bold('0')}\nWinners: ${bold(noOfWinners)}`)
		.setTimestamp();
}

function createRaffleButtons() {
	const joinRaffleButton = new ButtonBuilder()
		.setCustomId('button-raffle-join')
		.setLabel('🎟️')
		.setStyle(ButtonStyle.Primary);

	return new ActionRowBuilder()
		.addComponents(joinRaffleButton);
}

async function saveRaffle(raffleMessage, prize, description, date, noOfWinners) {
	const doc = new UpcomingRaffle({
		_id: raffleMessage.id,
		channelId:  raffleMessage.channelId,
		prize: prize,
		description: description,
		date: date,
		noOfWinners: noOfWinners,
		entries: [],
	});

	await doc.save();
}


module.exports = {
	data: new SlashCommandBuilder()
		.setName('raffle')
		.setDescription('Manage all things raffle.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand =>
			subcommand.setName('start')
				.setDescription('Launch a raffle!')
				.addStringOption(option =>
					option.setName('prize')
						.setDescription('What is being won?')
						.setMaxLength(256)
						.setRequired(true),
				)
				.addNumberOption(option =>
					option.setName('date')
						.setDescription('When should this raffle end? (Use HammerTime)')
						.setRequired(true),
				)
				.addStringOption(option =>
					option.setName('description')
						.setDescription('A long form piece around this prize.'),
				)
				.addChannelOption(option =>
					option.setName('channel')
						.setDescription('Where is this raffle being held? (Defaults to #raffles-entry)')
						.addChannelTypes(ChannelType.GuildText),
				)
				.addNumberOption(option =>
					option.setName('winner-count')
						.setDescription('How many winners should there be? (Defaults to 1)'),
				),
		),
	async execute(interaction) {
		if (interaction.options.getSubcommand() === 'start') {
			await interaction.deferReply({ ephemeral: true });

			const prize = interaction.options.getString('prize');
			const description = interaction.options?.getString('description') || null;
			const date = interaction.options.getNumber('date');
			const channel = interaction.options?.getChannel('channel')
				?? await interaction.guild.channels.cache.get('1112540056528375913');
			const noOfWinners = interaction.options?.getNumber('winner-count') ?? 1;

			if (validateDate(date) === false) {
				return interaction.followUp('Please enter a valid date.');
			}

			const raffleEmbed = createRaffleEmbed(prize, description, date, noOfWinners);
			const raffleButtons = createRaffleButtons();

			const raffleMessage = await channel.send({
				embeds: [raffleEmbed],
				components: [raffleButtons],
			});

			await saveRaffle(raffleMessage, prize, description, date, noOfWinners);

			return interaction.followUp({
				content: `Raffle successfully started!\nId: ${raffleMessage.id}`,
				ephemeral: true,
			});
		}
	},
};
