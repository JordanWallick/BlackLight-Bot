/*###########################################################################################################################
#                                               Scouting Functions                                                          #
#   Contain all functions that make up the functionality of the scout command                                               #
###########################################################################################################################*/

// Imports
import {createRequire}  from 'module';
import {titleCase}      from './HelperFunctions.js';
const require   = createRequire(import.meta.url);
const {Client, RichEmbed} = require('discord.js');
const rp        = require('request-promise');
const cheerio   = require('cheerio');

// Bot Commands
const COMMAND_DELIM          = "/bb";
const COMMAND_HELP           = "help";
const COMMAND_ADD_CHANNEL    = "addchannel";
const COMMAND_REMOVE_CHANNEL = "removechannel"
const COMMAND_LEARN_MAP      = "learn";
const COMMAND_QUIZ_MAP       = "quiz";
const COMMAND_PAUSE_QUIZ     = "pause";
const COMMAND_RESUME_QUIZ    = "resume";
const COMMAND_END_QUIZ       = "endquiz";
const COMMAND_SCOUT          = "scout";

// Main scout command that will take the original message as well as it's content to scout player / team information and output in Discord
// <TBD> Allow the team command to scout multiple teams from a bracket
// <TBD> Attempt to find correct battle tag if incorrect capitalization
export async function scout(original_message, string_to_scout)
{
    const battle_tag_regex = /\S+#\d+/gm; // Regular expression to match a valid Blizzard battle tag
    const gamebattles_team_regex = /^(https*:\/\/){0,1}gamebattles.majorleaguegaming.com\/pc\/overwatch\/team\/\d+\/{0,1}$/gmi; // Regular expression to match a valid gamebattles team URL

    if(string_to_scout.match(battle_tag_regex) != null) // If the user passed a battle tag...
    {
        let battle_tag_array = []; // Array of battle tag strings
        for(let battle_tag of string_to_scout.match(battle_tag_regex)) // For every battle tag the user wishes to scout, look them up and output them (if no argument that these users are a part of a team is also given)
            battle_tag_array.push(battle_tag); // Array containing all passed battle tags

        if(battle_tag_array.length > 12) // The bot will only take a maximum of 12 battle tags to prevent too much spam
        {
            original_message.channel.send("Only 12 battle tags may be scouted at once. Please try again with less battle tags.");
        }
        else if(battle_tag_array.length > 1) // If there were multiple battle tags given, give the output in "team mode"
        {
            original_message.channel.send("Scouting players. Please wait...");
            const scouted_team_data = await overbuffTeamScout(battle_tag_array);
            discordOutputTeamPlayerData(original_message, "User Input Team", scouted_team_data);
        }
        else // If only one battle tag was given, give the output as an individual
        {
            original_message.channel.send("Scouting player. Please wait...");
            let player_data = await overbuffPlayerScout(battle_tag_array[0]) // Array containing an individual's roles, SRs, and top 3 heroes in those roles. This requires an async callback for player_data
            discordOutputOverwatchPlayerData(original_message, battle_tag_array[0], player_data);
        }
        return;
    }
    else if(string_to_scout.match(gamebattles_team_regex) != null) // If the user passed a gamebattles team URL...
    {
        original_message.channel.send("Scouting team. Please wait...");
        let gamebattles_data; // Will hold all information scrapped from both gamebattles (battle tag, team role) and overbuff (roles ranked in, sr for each role, top heros for each role)
        try
        {
            gamebattles_data = await getGamebattlesData(string_to_scout); // Will hold all information scrapped from both gamebattles (battle tag, team role) and overbuff (roles ranked in, sr for each role, top heros for each role)
        }
        catch
        {
            original_message.channel.send("There was a problem parsing this team URL. Please check the team URL and try again.");
            return;
        }
        
        if(gamebattles_data == null) // If getGamebattlesData() was not able to parse the html of the gamebattles team, continue
        {
            original_message.channel.send("There was a problem finding players on the gamebattles team URL. Please check the team URL and try again.");
            return;
        }

        const team_name = gamebattles_data.team_name; // Name of the gamebattles team (String)
        const gamebattles_battle_tags = gamebattles_data.battle_tags; // Battle tags and gamebattles team role of each player (Array)
        try
        {
            const scouted_team_data = await overbuffTeamScout(gamebattles_battle_tags); // Scout every player on gamebattles using their battle tags, sort them, and return an object with their battle tags and overbuff stats (also an object)
            discordOutputTeamPlayerData(original_message, team_name, scouted_team_data); // Output the team's data to the Discord channel the scout request was sent from
        }
        catch
        {
            original_message.channel.send(`Was not able to scout OverBuff information on ${team_name}`);
        }
        return;
    }
    else // If this point is reached, the given string is not valid
        original_message.channel.send("Last argument of invalid form! Must be either a valid battle tag, list of battle tags, or Gamebattles team URL.");
}

// Given a battle tag, search this player on overbuff
async function overbuffPlayerScout(battle_tag)
{
    let battle_tag_split = battle_tag.split("#");   //Split the battle tag on the hash tag
    const player_name    = battle_tag_split[0];     // User name of a player
    const numeric_id     = battle_tag_split[1];     // Numeric Id of a battle tag

    const overbuff_mainpage_url = "http://www.overbuff.com/players/pc/" + player_name + "-" + numeric_id + "?mode=competitive:formatted"; // URL of this player's competitive overbuff page
    const overbuff_heroes_url = "http://www.overbuff.com/players/pc/"  + player_name + "-" + numeric_id + "/heroes?mode=competitive"; // URL of this player's top played heroes

    let roles = []; // Array of every role this player is ranked in
    let ranks = []; // Array of sr that is directly associated with roles[]
    let comp_heroes = []; // Array of the top heroes this player plays in competitive (will be sorted to top 3 for each role)

    // Get the html of the player's competitive overbuff page
    let html;
    try
    {
        html = await rp(overbuff_mainpage_url);
    }
    catch
    {
        console.log(`Unable to load Overbuff main page of ${battle_tag}`);
        return [];
    }
    
    if(html == undefined || html == null)
    {
        console.log(`Overbuff main page of ${battle_tag} returned no data`);
        return [];
    }

    let page_html = cheerio.load(html); // Use cheerio to get the entire page's HTML structure
    let rankings_table; // Use cheerio to parse down the page to just the rankings segment of the HTML
    let rankings_data_cells; // Look for every data cell tag within the rankings section of the HTML
    try
    {
        rankings_table = cheerio.load(page_html('div[data-portable-target=ratings-desktop]').html());
        rankings_data_cells = rankings_table('tbody[class=stripe-rows]').find('td');
    }
    catch
    {
        console.log(`Parsing rank data for ${battle_tag} failed`);
        return [];
    }
    

    // Iterate though the role queue ranking data in the HTML
    for(let loop_count = 0; loop_count < rankings_data_cells.length; loop_count++)
    {
        let c_rankings_data_cell = rankings_table(rankings_data_cells[loop_count]); // Cheerio wrapper for the rankings_data_cells[] object currently being evaluated
        
        try
        {
            let temp_parse = c_rankings_data_cell.find('img').attr('alt'); // This will attempt to look for the role
            if(temp_parse !== undefined)
                roles.push(temp_parse.toLocaleLowerCase());

            temp_parse = c_rankings_data_cell.attr('data-value'); // This will attempt to look for the sr
            if(temp_parse !== undefined)
                ranks.push(temp_parse);
        }
        catch
        {
            return [];
        }
    }

    // Get the html of the player's heroes overbuff page
    try
    {
        html = await rp(overbuff_heroes_url);
    }
    catch
    {
        console.log(`Unable to load Overbuff hero page of ${battle_tag}`);
        return [];
    }
    
    if(html == undefined || html == null)
    {
        console.log(`Overbuff hero page of ${battle_tag} returned no data`);
        return [];
    }

    page_html = cheerio.load(html); // Use cheerio to get the entire page's HTML structure
    let hero_table = cheerio.load(page_html('div[class=table-with-filter-tabs]').html()); // Use cheerio to parse down the page to just the hero table
    let hero_table_items = hero_table('tbody').find('tr'); // Get an iterable object of heroes on the hero table

    for(let loop_count = 0; loop_count < hero_table_items.length; loop_count++) // Get the top heroes this person plays
    {
        let c_hero_table_item = hero_table(hero_table_items[loop_count]); // Cheerio wrapper for the hero_table_items[] object currently being evaluated

        try
        {
            let temp_parse = c_hero_table_item.find('a[class=color-white]').text(); // This will attempt to look for a hero
            comp_heroes.push(temp_parse.toLocaleLowerCase());
        }
        catch
        {
            console.log(`Was unable to parse top hero data for ${battle_tag}`);
            return [];
        }
    }

    console.log(`Finished scouting ${battle_tag}`);
    return processOverbuffArrays(roles, ranks, comp_heroes); // Returned the processed data. Will return an object with the structure: [{role, sr, top_three_heroes}]
}

// Will scout multiple battle tags and sort them based on each player's highest rated SR
async function overbuffTeamScout(battle_tag_array)
{
    let team_players_data = []; // The scouted information of all battle tags given, in the order of battle tags given
    for(let loop_count = 0; loop_count < battle_tag_array.length; loop_count++) // For every player that was found on the gamebattles team...
    {
        let current_player_data = await overbuffPlayerScout(battle_tag_array[loop_count]) // Array containing an individual's roles, SRs, and top 3 heroes in those roles

        if(current_player_data.length > 0) // If the player is ranked in at least one role, add them to the list with their peak SR as an additional property.
            team_players_data.push({battle_tag: battle_tag_array[loop_count], player_data: current_player_data, top_sr: current_player_data[0].sr});
        else
            team_players_data.push({battle_tag: battle_tag_array[loop_count], player_data: current_player_data});
    }
    return sortScoutedPlayers(team_players_data); // Return the scouted information of all battle tags given, in the order of highest role's SR
}

// Process the arrays that overbuffPlayerLookup() finds.
function processOverbuffArrays(roles, ranks, hero_list)
{
    const tank_heroes    = ["d.va", "orisa", "reinhardt", "roadhog", "sigma", "winston", "wrecking ball", "zarya"]; // List of all tank heros in the game (in the format overbuff stores them)
    const dps_heroes     = ["ashe", "bastion", "doomfist", "echo", "genji", "hanzo", "junkrat", "mccree", "mei", "pharah", "soldier: 76", "sombra", "symmetra", "torbjörn", "tracer", "widowmaker"]; // List of all DPS heros in the game (in the format overbuff stores them)
    const support_heroes = ["ana", "baptiste", "brigitte", "lúcio", "mercy", "moira", "zenyatta"]; // List of all support heros in the game (in the format overbuff stores them)

    let player_data = []; // Array that will hold a list of all a player's roles they are ranked in, their srs, and the top 3 heroes in each of those roles in the structure [{role, sr, top_three_heroes}]

    // This structure will take a person's top 10 heroes and sort out their top 3 for every role they are ranked in
    for(let loop_count = 0; loop_count < roles.length; loop_count++)
    {
        let heroes_to_iterate; // Array of heroes in the current role

        // Will determine which of the hero arrays at the top of this function to search though (based on the current role being processed)
        switch(roles[loop_count])
        {
            case "tank":
                heroes_to_iterate = tank_heroes;
                break;
            case "offense":
            case "defence": // Overbuff still stores damage heroes as offence or defence
                heroes_to_iterate = dps_heroes;
                roles[loop_count] = "damage"; // Set either offense or defence in this array to be the "damage" category since the former two are no longer relevant
                break;
            case "support":
                heroes_to_iterate = support_heroes;
                break;
            default:
                console.log("Could not identify role name '" + roles[loop_count] + "'");
                return -1;
        }

        let hero_array = [] // Array that will hold the top 3 heroes for the current role
        for(let i = 0; i < hero_list.length && hero_array.length < 3; i++) // For every hero in this player's top competitive heroes, match the heroes that are within the current role being processed
        {
            for(let j = 0; j < heroes_to_iterate.length && hero_array.length < 3; j++)
            {
                if(hero_list[i].includes(heroes_to_iterate[j])) // If the hero in the player's top heroes is in the hero array, add that hero to the top 3 heroes for that role
                {
                    hero_array.push(hero_list[i])
                    continue;
                }
            }
        }

        player_data.push({role: roles[loop_count], sr: ranks[loop_count], top_three_heroes: hero_array});
    }

    player_data.sort((a, b) => {return b.sr - a.sr}); // Sort player_data[] based on sr. The role with the highest sr will be first
    return player_data;
}

// Given a gamebattles team URL, this will parse for a team name and team players
async function getGamebattlesData(team_url)
{
    const team_id = team_url.match(/\d+/gm)[0]; // Regular Expression match to get the team id from the end of the URL

    let team_name = await getGamebattlesTeamName(team_id); // Get the gamebattles team name
    const game_battles_battle_tags = await getGamebattlesTeamBattleTags(team_id); // Get all gamebattles team player battle tags and gamebattles team roles
    
    if(team_name == "") // If a team name was not found on the gamebattles URL...
        team_name = "Team";
    
    if(game_battles_battle_tags != null)
        return {team_name: team_name, battle_tags: game_battles_battle_tags};
    else
        return null
}

// Given a Gamebattles team id, this function will return a list of player battle tags and gamebattles team roles
async function getGamebattlesTeamBattleTags(team_id)
{
    const team_memextended_page = `https://gb-api.majorleaguegaming.com/api/web/v1/team-members-extended/team/${team_id}`; // URL of team player information from gamebattle's api

    const options = 
    {
        url: team_memextended_page,
        json: true
    }

    const team_player_data_html = await rp(options); // Get the html of the team's player's information

    if(team_player_data_html == undefined || team_player_data_html == null) // If the html was not found...
    {
        return null;
    }

    const battle_tags = []; // Array of objects of every player on a gamebattles team including that player's battle tag and their gamebattles role
    for(let player_data of team_player_data_html.body) // For every player that was found in the HTML...
    {
        const current_battle_tag = player_data.teamMember.gamertag;

        if(current_battle_tag !== undefined || current_battle_tag !== null)
            battle_tags.push(current_battle_tag);
        else
            battle_tags.push(player_data.teamMember.username);
    }

    return battle_tags;
}

// Given a gamebattles team id, this function will get the team's name
async function getGamebattlesTeamName(team_id)
{
    const team_info_url = `https://gb-api.majorleaguegaming.com/api/web/v1/team-screen/${team_id}` // URL of general team information from gamebattle's api

    const options = 
    {
        url: team_info_url,
        json: true
    }

    const team_info_html = await rp(options); // Get the html of the team's general information

    if(team_info_html == undefined || team_info_html == null)  // If the html was not found...
    {
        return "";
    }

    try
    {
        return team_info_html.body.teamWithEligibilityAndPremiumStatus.team.name;
    }
    catch
    {
        return "";
    }
}

// Will sort the players based on sr
function sortScoutedPlayers(scouted_players_array)
{
    scouted_players_array.sort((a, b) => (a.top_sr == undefined)|(a.top_sr < b.top_sr) ? 1 : -1); // Sort player_data[] based on each player's top role sr
    return scouted_players_array;
}

// Output a fully scouted player's information in the same Discord channel the scouting command was sent
async function discordOutputOverwatchPlayerData(original_message, battle_tag, player_ranks)
{
    const player_scout_embed = new RichEmbed()
        .setColor('0x6f07ab')
        .setTitle(battle_tag + "'s Competitive Lookup");

    if(player_ranks.length < 1) // Player profile was found, but they are not ranked
    {
        player_scout_embed.setDescription("Player does not exist or is not ranked.");
    }
    else
    {
        for(let loop_count = 0; loop_count < player_ranks.length; loop_count++) // For every role the player is ranked in, add their info to the Discord embed
            player_scout_embed.addField(titleCase(player_ranks[loop_count].role), "SR: " + player_ranks[loop_count].sr + "\n" + await getHeroesOutputString(original_message, player_ranks[loop_count].top_three_heroes));

        player_scout_embed.setFooter("All stats obtained from https://www.overbuff.com/");
    }
    
    await original_message.channel.send(player_scout_embed);
}

// Output a gamebattles team or a team of given battle tags
async function discordOutputTeamPlayerData(original_message, team_name, team_players_data)
{
    const team_scout_embed = new RichEmbed()
        .setColor('0x6f07ab')
        .setTitle(team_name + " Scouting Information")
        .setFooter("All stats obtained from https://www.overbuff.com/");
    if(team_players_data.length < 1) // If the team was not able to be parsed...
    {
        team_scout_embed.setDescription("No players were able to be parsed on this team.");
    }
    else
    {
        let top_players_avg_sr = 0; // Total sr added from the top players
        let players_counted = 0; // Number of players that were counted in the average
        
        for(let team_mem_lc = 0; team_mem_lc < team_players_data.length; team_mem_lc++) // For every player on this team, add all competitive data to the embed and calculate average
        {
            let current_player = team_players_data[team_mem_lc]; // The current player being appended to the embed
            let current_player_comp_data = current_player.player_data; // The competitive data of the current player

            if(current_player_comp_data == undefined) // If the player's overbuff URL was not able to be parsed...
            {
                team_scout_embed.addField(current_player.battle_tag + "'s Info", "Error: Could not parse player's data from Overbuff");
                continue;
            }

            if(team_mem_lc < 6 && current_player.top_sr !== undefined) // If there have been less than 6 player's sr added to the average and the current player has a valid top ranked role...
            {
                top_players_avg_sr = parseInt(top_players_avg_sr) + parseInt(current_player.top_sr); // Add their top rank to the total sr pool
                players_counted++; // Increment player's counted to be used for the average
            }

            // Will loop though all roles a player is ranked in, appending them to a string for appendage to team_scout_embed
            let scouting_string = "";
            try
            {
                for(let roles_lc = 0; roles_lc < current_player_comp_data.length; roles_lc++)
                {
                    scouting_string += titleCase(current_player_comp_data[roles_lc].role) + " SR: **" + current_player_comp_data[roles_lc].sr + "** " + await getHeroesOutputString(original_message, current_player_comp_data[roles_lc].top_three_heroes);

                    if(roles_lc < current_player_comp_data.length - 1) // Append a new line character if this is not the last loop
                        scouting_string += "\n";
                }
                    team_scout_embed.addField(current_player.battle_tag + "'s Info", scouting_string);
            }
            catch
            {
                team_scout_embed.addField(current_player.battle_tag + "'s Info", "No competitive data found.");
            }
        }

        // Calculate the team average if more than 2 people were counted and append to the embed
        if(players_counted > 2)
            team_scout_embed.addField("TEAM AVERAGE FOR THE TOP " + players_counted + " PLAYERS", "**" + Math.round((parseInt(top_players_avg_sr) / parseInt(players_counted))) + "** for the team's top " + players_counted + " players.");
        else if(players_counted < 1)
            team_scout_embed.addField("No ranks to calculate average.");
    }
    console.log(`Sending scouting information embed for team ${team_name}`);
    await original_message.channel.send(team_scout_embed);
}

// Get the emoji names for a players top 3 heroes and return them as a printable string
//<TBD> Do something if the server does not have hero emojis
async function getHeroesOutputString(original_message, hero_name_array)
{
    let special_hero_names      = ["d.va", "soldier: 76", "torbjörn", "lúcio", "wrecking ball"]; // Hero names in overbuff that have special characters that cannot exist in Discord emoji names
    let server_hero_emoji_names  = ["dva", "soldier76", "torbjorn", "lucio", "wreckingball"]; // The associated names of the hero emojis used in some servers BlackLight is on

    let hero_emojis_string = ""; // String of every hero emoji to be appended to this role's information
    if(hero_name_array !== undefined | hero_name_array !== null)
    {
        for(let i = 0; i < hero_name_array.length; i++)
        {
            if(hero_name_array[i] === undefined || hero_name_array[i] == "") // No valid hero name was passed...
            {
                hero_emojis_string += "";
                continue;
            }

            let current_hero_emoji = "";
            for(let loop_count = 0; loop_count < special_hero_names.length; loop_count++) // For every hero name that contains a special character, look to see if the passed hero name is one of them and translate them to the names of the Discord emojis
            {
                if(hero_name_array[i].includes(special_hero_names[loop_count]))
                {
                    current_hero_emoji = await original_message.guild.emojis.find(emoji => emoji.name === server_hero_emoji_names[loop_count]);
                    break;
                }
            }

            if(current_hero_emoji == "") // If the hero emoji was not yet set because it does not contain special characters...
                current_hero_emoji = await original_message.guild.emojis.find(emoji => emoji.name === hero_name_array[i]);

            if(current_hero_emoji !== null) // If the hero emoji name was found, add it to the output string. Otherwise, simply append the name of the hero to the output string
                hero_emojis_string += ` ${current_hero_emoji}`;
            else
                hero_emojis_string += ` **${titleCase(hero_name_array[i])}**`;
        }
    }
    
    if(hero_emojis_string == '')
        return "No current season hero data";

    return `Heroes: ${hero_emojis_string}`;
}