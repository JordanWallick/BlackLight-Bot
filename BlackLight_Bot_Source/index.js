/*###########################################################################################################################
#                                               BlackLight Bot                                                              #
#   Discord.js bot developed for various helpful tasks involving teaching tools and scouting for Overwatch teams            #
#                                                                                                                           #
#   Developed by Jordan Wallick     Email: JordanAWallick@gmail.com     Discord: BlackLight#9996                            #
###########################################################################################################################*/

// Imports
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
import {scout, scoutMatches, scoutAllMatches} from './additional_blacklight_modules/ScoutingFunctions.js';
//import {quiz, learn} from './additional_blacklight_modules/CallOutFunctions.js';

// Libraries and APIs
const {Client, RichEmbed} = require('discord.js');
const thisBot = new Client();
const fs = require('fs');

// Bot information and command delimiters
const BOT_NAME                  = "BlackLight Bot";
const BOT_VERSION               = "1.9";
const BOT_UPDATE_DATE           = "3/16/2021";
const VERSION_CHANGE_NOTES      = "-Fixed bug where bot would crash on reconnect";
const COMMAND_DELIM             = "/bb";
const COMMAND_HELP              = "help";
const COMMAND_VERSION_INFO      = "version";
const COMMAND_ADD_CHANNEL       = "addchannel";
const COMMAND_REMOVE_CHANNEL    = "removechannel";
const COMMAND_SCOUT             = "scout";
const COMMAND_SCOUT_MATCHES     = "scoutmatches";
const COMMAND_SCOUT_ALL_MATCHES = "scoutallmatches";
//const COMMAND_LEARN_MAP       = "learn";
//const COMMAND_QUIZ_MAP        = "quiz";
//const COMMAND_PAUSE_QUIZ      = "pause";
//const COMMAND_RESUME_QUIZ     = "resume";
//const COMMAND_END_QUIZ        = "endquiz";


// Important file paths
const BOT_LOGIN_TOKEN_PATH      = "./bot_assets/login_token.txt";       // Path of the text file containing the bot's login token
const BOT_CLIENT_ID_PATH        = "./bot_assets/client_id.txt";         // Path of the text file containing the bot's client Id token
const TEST_BOT_LOGIN_TOKEN_PATH = "./bot_assets/login_token_test.txt";  // Path of the text file containing the test bot's login token
const TEST_BOT_CLIENT_ID_PATH   = "./bot_assets/login_token_test.txt";  // Path of the text file containing the test bot's client Id token
const CHANNEL_WHITELIST_PATH    = './bot_assets/channel_whitelist.txt'; // Path of the text file that stores the channel white list

// Bot variables stored in text files
const LOGIN_TOKEN   = String(fs.readFileSync(BOT_LOGIN_TOKEN_PATH, 'utf8'));     // Bot login token
const CLIENT_ID     = String(fs.readFileSync(BOT_CLIENT_ID_PATH, 'utf8'));       // Bot client id
//const LOGIN_TOKEN   = String(fs.readFileSync(TEST_BOT_LOGIN_TOKEN_PATH, 'utf8'));     // ENABLE FOR TEST BOT CLIENT
//const CLIENT_ID     = String(fs.readFileSync(TEST_BOT_CLIENT_ID_PATH, 'utf8'));       // ENABLE FOR TEST BOT CLIENT
let channel_whitelist = ''; //Holds all channels the bot can post advanced commands in (helps prevent spam)

// When the bot is ready to come online
thisBot.on('ready', () =>
{
    channel_whitelist = fs.readFileSync(CHANNEL_WHITELIST_PATH, 'utf8'); // Copy all stored channels that were previously in the whitelist to the variable
    thisBot.user.setActivity(`${COMMAND_DELIM} ${COMMAND_HELP}`, {type: "PLAYING"}); // Set the bot's status to show users the initial command to use the bot
    if(fs.readFileSync(TEST_BOT_CLIENT_ID_PATH) == CLIENT_ID) // If the bot is using the testing bot, log that information
        console.log('BlackLight Bot is online and on testing client!');
    else
        console.log('BlackLight Bot is online!');
})

// Every time a message is posted on a server the bot is in
thisBot.on('message', async message => 
{
    let author_id       = message.author.id;        // Discord author id of the message being processed
    let message_author  = message.author.username;  // Discord author username of the message being processed
    let input_message   = message.content;          // String of the message being processed

    if(author_id === CLIENT_ID) // If the message posted is from this bot...
        return;

    // Checking for the command delimiter
    if(input_message.match(RegExp('^' + COMMAND_DELIM)) != null) // Look for the command delimiter at the beginning of a message
    {
        let input_command = "";
        try
        {
            input_command = input_message.split(" ");
        }
        catch(error)
        {
            return;
        }

        // Evaluate the second substring in a message, as it will contain the command to run
        // This first switch statement contains commands that can be used in any channel
        switch(input_command[1])
        {
            // User requested help
            case COMMAND_HELP:
            {
                console.log(`Help request from ${message_author} (${author_id}): ${message.content}`);
                let help_embed = new RichEmbed()
                .setTitle(BOT_NAME + " Help")
                .setColor('0x6f07ab')
                .addField("**General Commands**", 
                    `${COMMAND_DELIM} ${COMMAND_HELP} - Displays this message 😊\n `+
                    `${COMMAND_DELIM} ${COMMAND_ADD_CHANNEL} - Add a channel to the command whitelist\n` +
                    `${COMMAND_DELIM} ${COMMAND_REMOVE_CHANNEL} - Remove a channel from the command whitelist\n` +
                    `${COMMAND_DELIM} ${COMMAND_VERSION_INFO} - See the bot version and change notes of the most recent update`)
                /*.addField('**Call Out Commands (DISABLED INDEFINITELY)**',
                    `${COMMAND_DELIM} ${COMMAND_LEARN_MAP} <map> - Displays all answer keys for a specific map\n` +
                    `${COMMAND_DELIM} ${COMMAND_QUIZ_MAP} - Will quiz you or a group on all call outs for a random area of a random map\n` +
                    `${COMMAND_DELIM} ${COMMAND_QUIZ_MAP} <map> - Will quiz you or a group of all call outs for a specific map\n` +
                    "\n**Supported Maps**\nn/a")*/
                .addField("**Scouting Commands**",
                    `${COMMAND_DELIM} ${COMMAND_SCOUT} <BATTLE TAG(S) / GAMEBATTLES TEAM URL> - Will search Overbuff for a battle tag, a list of battle tags, or an entire Gamebattles team.\n` +
                    `${COMMAND_DELIM} ${COMMAND_SCOUT_MATCHES} <GAMEBATTLES TEAM URL> - Will scout all previous and upcoming matches for this team (the gamebattles URL should be for **your** team if you are interested in **your** matches).`)
                .setFooter(`Developed by BlackLight#9996\nDM me know if you have any suggestions or bug reports`);
                message.channel.sendEmbed(help_embed);
                return;
            }
            // Display current version and change notes
            case COMMAND_VERSION_INFO:
            {
                console.log(`Version info request from ${message_author} (${author_id}): ${message.content}`);
                let version_embed = new RichEmbed()
                .setTitle(BOT_NAME + " Version Info")
                .setThumbnail(thisBot.user.avatarURL)
                .setColor('0x6f07ab')
                .addField(`**Bot Version ${BOT_VERSION}**`, "___")
                .addField("Change Notes", `${VERSION_CHANGE_NOTES}`)
                .setFooter(`Developed by BlackLight#9996\nDM me know if you have any suggestions or bug reports`);
                message.channel.sendEmbed(version_embed);
                return;
            }
            // User wants to add the channel being posted in to the channel whitelist
            case COMMAND_ADD_CHANNEL:
            {
                if(!channel_whitelist.includes(message.channel.id))
                {
                    channel_whitelist = channel_whitelist + message.channel.id + ',';
                    fs.writeFileSync(CHANNEL_WHITELIST_PATH, channel_whitelist);

                    message.channel.send("BlackLight Bot commands can now be entered in this channel! 🤖");
                }
                else
                    message.channel.send("BlackLight Bot commands are already enabled in this channel.");
                return;
            }
            // User wants to remove the channel being posted in from the channel whitelist    
            case COMMAND_REMOVE_CHANNEL:
            {
                if(channel_whitelist.includes(message.channel.id))
                {
                    channel_whitelist = channel_whitelist.replace(message.channel.id + ',', '');
                    fs.writeFileSync(CHANNEL_WHITELIST_PATH, channel_whitelist);

                    message.channel.send("This channel will no longer support BlackLight Bot commands.");
                }
                else
                    message.channel.send("BlackLight Bot commands were already disabled in this channel.");
                return;
            }
        }
        
        if(!channel_whitelist.includes(message.channel.id)) // If the channel the message was posted in is not in the whitelist, tell the user such and return
        {
            message.channel.send(`That command does not work in non-whitelisted channels. Use ${COMMAND_DELIM} ${COMMAND_ADD_CHANNEL} to whitelist this channel.`);
            return;
        }

        // Evaluate the second substring in a message, as it will contain the command to run
        // This second switch statement contains commands that can be ran in a whitelisted channel
        switch(input_command[1])
        {
            /*// User requests to learn a map's call outs
            case COMMAND_LEARN_MAP:
                console.log(`Learn request from ${message_author} (${author_id}): "${message.content}"`);
                var input_map = "";
                try
                {
                    input_map = input_command[2].toLowerCase()
                }
                catch(error)
                {
                    message.channel.send("You must specify a map to learn.");
                    return;
                }

                await learn(message, input_map);
                message.channel.send("Command disabled indefinitely.");
                return;*/
            
            /*// User requests to be quizzed on a map
            case COMMAND_QUIZ_MAP:
                console.log(`Quiz request from ${message_author} (${author_id}): "${message.content}"`);
                var input_map = "";
                try
                {
                    input_map = input_command[2].toLowerCase()
                }
                catch(error)
                {
                    message.channel.send("You must specify a map to be quizzed on.");
                    return;
                }
                
                const additional_commands = {pause: COMMAND_PAUSE_QUIZ, resume: COMMAND_RESUME_QUIZ, end: COMMAND_END_QUIZ}
                quiz(message, input_map, await getPlayers(message), additional_commands); // Call the quiz function, passing it the message, parsed map name, and a list of players
                message.channel.send("Command disabled indefinitely.");
                return;*/

            // User requested to scout an individual or team
            case COMMAND_SCOUT:
            {
                console.log(`Scouting request from ${message_author} (${author_id}): "${message.content}"`);

                let string_to_scout; // The player or team to get scouting information on
                try
                {
                    string_to_scout = input_message.replace(`${COMMAND_DELIM} ${COMMAND_SCOUT}`,'').trim(); // Anything past the command delimiter and scout command is to be parsed
                }
                catch(error)
                {
                    message.channel.send("Last argument must either be a valid battle tag or gamebattles team URL.");
                    return;
                }

                message.channel.send("Scouting in progress. Please wait...");
                await scout(message, string_to_scout); // Call the scout function, passing it the individual(s) or team(s) to be scouted
                return;
            }
            case COMMAND_SCOUT_MATCHES:
            {
                console.log(`Matches scouting request from ${message_author} (${author_id}): "${message.content}"`);

                let gb_team_url_to_parse; // The player or team to get scouting information on
                try
                {
                    gb_team_url_to_parse = input_message.replace(`${COMMAND_DELIM} ${COMMAND_SCOUT_MATCHES}`,'').trim(); // Anything past the command delimiter and scout command is to be parsed
                }
                catch(error)
                {
                    message.channel.send("Last argument must be a valid gamebattles team URL.");
                    return;
                }

                let matches_found = await scoutMatches(message, gb_team_url_to_parse); // Call the scout function, passing it the individual(s) or team(s) to be scouted
                if(matches_found)
                    await message.channel.send("Scouting completed 😊");
                else
                    await message.channel.send("No matches scheduled for this team.");
                return;
            }
            case COMMAND_SCOUT_ALL_MATCHES:
            {
                console.log(`All matches scouting request from ${message_author} (${author_id}): "${message.content}"`);

                let gb_team_url_to_parse; // The player or team to get scouting information on
                try
                {
                    gb_team_url_to_parse = input_message.replace(`${COMMAND_DELIM} ${COMMAND_SCOUT_ALL_MATCHES}`,'').trim(); // Anything past the command delimiter and scout command is to be parsed
                }
                catch(error)
                {
                    message.channel.send("Last argument must be a valid gamebattles team URL.");
                    return;
                }

                await scoutAllMatches(message, gb_team_url_to_parse); // Call the scout function, passing it the individual(s) or team(s) to be scouted
                await message.channel.send("Scouting completed 😊");
                return;
            }
        }
    }
})

// ERROR EVENTS
thisBot.on('disconnect', message => {
    sendToLogs(`Client Disconnected`)
});

thisBot.on('reconnecting', message => {
    console.log(`Client Reconnecting...`)
});

thisBot.on('resume', message => {
    console.log(`Reconnected!`)
});

thisBot.on("unhandledRejection", err => {
    console.error(`Uncaught Promise Error: \n ${err.stack}`);
});

thisBot.on('error', err => {
    console.log(err);
});

// BOT LOGIN
thisBot.login(LOGIN_TOKEN)
    .catch( err =>{
        console.log(`Unable to connect client`);
    });
