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
const COMMAND_REMOVE_CHANNEL = "removechannel";
const COMMAND_LEARN_MAP      = "learn";
const COMMAND_QUIZ_MAP       = "quiz";
const COMMAND_PAUSE_QUIZ     = "pause";
const COMMAND_RESUME_QUIZ    = "resume";
const COMMAND_END_QUIZ       = "endquiz";
const COMMAND_SCOUT          = "scout";

// Overwatch Heroes
const tank_heroes    = ["d.va", "orisa", "reinhardt", "roadhog", "sigma", "winston", "wrecking ball", "zarya"]; // List of all tank heros in the game (in the format overbuff stores them)
const dps_heroes     = ["ashe", "bastion", "doomfist", "echo", "genji", "hanzo", "junkrat", "mccree", "mei", "pharah", "soldier: 76", "sombra", "symmetra", "torbjörn", "tracer", "widowmaker"]; // List of all DPS heros in the game (in the format overbuff stores them)
const support_heroes = ["ana", "baptiste", "brigitte", "lúcio", "mercy", "moira", "zenyatta"]; // List of all support heros in the game (in the format overbuff stores them)

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
            await discordOutputTeamPlayerData(original_message, "User Input Team", scouted_team_data);
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
        const team_icon_url = gamebattles_data.team_icon_url; // Icon art for the team
        const gamebattles_battle_tags = gamebattles_data.battle_tags; // Battle tags and gamebattles team role of each player (Array)
        try
        {
            const scouted_team_data = await overbuffTeamScout(gamebattles_battle_tags); // Scout every player on gamebattles using their battle tags, sort them, and return an object with their battle tags and overbuff stats (also an object)
            await discordOutputTeamPlayerData(original_message, team_name, team_icon_url, scouted_team_data); // Output the team's data to the Discord channel the scout request was sent from
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

// Will scout all the team's a single team is to compete against in a match bracket
export async function scoutMatches(original_message, gb_team_url)
{
    const team_id = gb_team_url.match(/\d+/gm)[0]; // Regular Expression match to get the team id from the end of the URL
    const enemy_team_ids = await getGamebattlesTournamentTeamIds(team_id)

    for(let loop_count = 0; loop_count < enemy_team_ids.length; loop_count++)
    {
        try
        {
            const current_team_url = `https://gamebattles.majorleaguegaming.com/pc/overwatch/team/${enemy_team_ids[loop_count]}`
            await scout(original_message, current_team_url);
        }
        catch
        {
            console.log(`Problem scouting team id ${enemy_team_ids[loop_count]} while matches scouting.`)
        }
    }
}

// Given a battle tag, search this player on overbuff
async function overbuffPlayerScout(battle_tag)
{
    let battle_tag_split = battle_tag.split("#");   //Split the battle tag on the hash tag
    const player_name    = battle_tag_split[0];     // User name of a player
    const numeric_id     = battle_tag_split[1];     // Numeric Id of a battle tag

    const overbuff_mainpage_url = "http://www.overbuff.com/players/pc/" + player_name + "-" + numeric_id + "?mode=competitive:formatted"; // URL of this player's competitive overbuff page
    let overbuff_heroes_url = "http://www.overbuff.com/players/pc/"  + player_name + "-" + numeric_id + "/heroes?mode=competitive"; // URL of this player's top played heroes

    let roles = []; // Array of every role this player is ranked in
    let ranks = []; // Array of sr that is directly associated with roles[]
    let heroes = []; // Array of the top heroes this player plays in competitive (will be sorted to top 3 for each role)

    let roles_and_ranks = await searchOverbuffForCompData(overbuff_mainpage_url);
    /*if(roles_and_ranks.length < 1) // If no roles were found for this player, check to see if the battle tag was not capitalized correctly (by using the Overbuff search feature)
    {
        roles_and_ranks = await searchForPlayer(battle_tag); //<TBD> Finish this
    }*/

    roles = roles_and_ranks.roles;
    ranks = roles_and_ranks.ranks;

    if(roles == undefined || roles.length < 0)
        return []

    let competitive_hero_data_flag = true;
    heroes = await searchOverbuffForHeroes(overbuff_heroes_url);

    if(heroes.length < 1) // If no heroes were found from the player's competitive data, take data from quick play
    {
        overbuff_heroes_url = "http://www.overbuff.com/players/pc/"  + player_name + "-" + numeric_id + "/heroes"; // URL of this player's top played quick play heroes
        heroes = await searchOverbuffForHeroes(overbuff_heroes_url);
        competitive_hero_data_flag = false;
    }

    console.log(`Finished scouting ${battle_tag}`);
    return processOverbuffArrays(roles, ranks, {heroes: heroes, hero_data_is_competitive: competitive_hero_data_flag}); // Returned the processed data. Will return an object with the structure: [{role, sr, top_three_heroes}]
}

// Search Overbuff for role and ranking data
async function searchOverbuffForCompData(overbuff_mainpage_url)
{
    let roles = []; // Array of every role this player is ranked in
    let ranks = []; // Array of sr that is directly associated with roles[]
    let html; // HTML of the player's overbuff URL
    // Get the html of the player's competitive overbuff page
    try
    {
        html = await rp(overbuff_mainpage_url);
    }
    catch
    {
        console.log(`Unable to load Overbuff page "${overbuff_mainpage_url}"`);
        return [];
    }
    
    if(html == undefined || html == null)
    {
        console.log(`Overbuffpage "${overbuff_mainpage_url}" returned no data`);
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
        console.log(`Parsing rank data from "${overbuff_mainpage_url}" failed`);
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

    return {roles: roles, ranks: ranks};
}

// Search an overbuff hero URL (either competitive or QP) for a list of heroes
async function searchOverbuffForHeroes(overbuff_heroes_url)
{
    let html; // HTML of the overbuff hero page
    // Get the html of the player's heroes overbuff page
    try
    {
        html = await rp(overbuff_heroes_url);
    }
    catch
    {
        console.log(`Unable to load Overbuff hero page "${overbuff_heroes_url}"`);
        return [];
    }
    
    if(html == undefined || html == null)
    {
        console.log(`Overbuff hero page "${overbuff_heroes_url}" returned no data`);
        return [];
    }

    let page_html = cheerio.load(html); // Use cheerio to get the entire page's HTML structure
    let hero_table = cheerio.load(page_html('div[class=table-with-filter-tabs]').html()); // Use cheerio to parse down the page to just the hero table
    let hero_table_items = hero_table('tbody').find('tr'); // Get an iterable object of heroes on the hero table
    let hero_list = [];

    for(let loop_count = 0; loop_count < hero_table_items.length; loop_count++) // Get the top heroes this person plays
    {
        let c_hero_table_item = hero_table(hero_table_items[loop_count]); // Cheerio wrapper for the hero_table_items[] object currently being evaluated

        try
        {
            let temp_parse = c_hero_table_item.find('a[class=color-white]').text(); // This will attempt to look for a hero
            hero_list.push(temp_parse.toLocaleLowerCase());
        }
        catch
        {
            console.log(`Was unable to parse top hero data on page "${overbuff_heroes_url}"`);
            return [];
        }
    }

    return hero_list;
}

// Will use Overbuff's search player feature to look for the player that is to be scouted
// <TBD> Finish this
async function searchForPlayer(battle_tag)
{
    const overbuff_search_url = "http://www.overbuff.com/search?q=" + battle_tag.replace('#', '-'); // Search for the player's battle tag
    let html; // HTML of the overbuff search page
    // Get the html of the player's heroes overbuff page
    try
    {
        html = await rp(overbuff_search_url);
    }
    catch
    {
        console.log(`Unable to load Overbuff search page "${overbuff_search_url}"`);
        return [];
    }
    // var options = {
    //     uri: overbuff_search_url,
    //     json: true
    // }
    // html = await rp(options);
    
    if(html == undefined || html == null)
    {
        console.log(`Overbuff search page "${overbuff_search_url}" returned no data`);
        return [];
    }

    let page_html = cheerio.load(html); // Use cheerio to get the entire page's HTML structure
    let search_results = cheerio.load(page_html('div[class=search-results]').html()); // Use cheerio to parse down the page to just the search results
    let search_results_items = search_results('a[class=SearchResult]'); // Get an iterable object of heroes on the hero table
    let hero_list = [];

    for(let loop_count = 0; loop_count < hero_table_items.length; loop_count++) // Get the top heroes this person plays
    {
        let c_hero_table_item = hero_table(hero_table_items[loop_count]); // Cheerio wrapper for the hero_table_items[] object currently being evaluated

        try
        {
            let temp_parse = c_hero_table_item.find('a[class=color-white]').text(); // This will attempt to look for a hero
            hero_list.push(temp_parse.toLocaleLowerCase());
        }
        catch
        {
            console.log(`Was unable to parse search data on page "${overbuff_search_url}"`);
            return [];
        }
    }

    return hero_list;
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
function processOverbuffArrays(roles, ranks, hero_list_obj)
{
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

        let hero_list = hero_list_obj.heroes; // List of heroes from either competitive or qp
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

        player_data.push({role: roles[loop_count], sr: ranks[loop_count], top_three_heroes: hero_array, hero_data_is_competitive: hero_list_obj.hero_data_is_competitive});
    }

    player_data.sort((a, b) => {return b.sr - a.sr}); // Sort player_data[] based on sr. The role with the highest sr will be first
    return player_data;
}

// Given a gamebattles team URL, this will parse for a team name and team players
async function getGamebattlesData(team_url)
{
    const team_id = team_url.match(/\d+/gm)[0]; // Regular Expression match to get the team id from the end of the URL

    const gb_name_icon_array = await getGamebattlesTeamNameAndIcon(team_id); // Get the gamebattles team name
    const team_name = gb_name_icon_array[0];
    const team_icon_url = gb_name_icon_array[1];
    const game_battles_battle_tags = await getGamebattlesTeamBattleTags(team_id); // Get all gamebattles team player battle tags and gamebattles team roles
    
    if(game_battles_battle_tags != null)
        return {team_name: team_name, team_icon_url: team_icon_url, battle_tags: game_battles_battle_tags};
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

// Given a team id, this function will find the ids of all the team's the 'friendly' team will be competing against
async function getGamebattlesTournamentTeamIds(friendly_team_id)
{
    const tournament_info_url = `https://gb-api.majorleaguegaming.com/api/web/v1/team-matches-screen/team/${friendly_team_id}?pageSize=5&pageNumber=1`
    
    const options = 
    {
        url: tournament_info_url,
        json: true
    }

    const tournament_info_html = await rp(options); // Get the html of the team's player's information

    if(tournament_info_html == undefined || tournament_info_html == null) // If the html was not found...
    {
        return null;
    }

    let team_ids = []; // Array of objects of every player on a gamebattles team including that player's battle tag and their gamebattles role
    for(let match_data of tournament_info_html.body.records) // For every player that was found in the HTML...
    {
        const home_team_id = match_data.homeTeamCard.id;        // Id of the randomly assigned "home" team
        const visitor_team_id = match_data.visitorTeamCard.id;  // Id of the randomly assigned "away" team

        // Check which Id which does not match the 'friendly' team's id (ie the team the currently scouted for team will be going up against)
        if(home_team_id != undefined && home_team_id != friendly_team_id)
            team_ids.push(home_team_id);
        else if(visitor_team_id != undefined && visitor_team_id != friendly_team_id)
            team_ids.push(visitor_team_id);
        else
            console.log("Problem with parsing home / visitor IDs");
    }

    return team_ids;
}

// Given a gamebattles team id, this function will get the team's name
async function getGamebattlesTeamNameAndIcon(team_id)
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

    // Super dumb nested way to try and return both values or try for one value if possible. If no items can be parsed then the function will return default values
    try
    {
        return [team_info_html.body.teamWithEligibilityAndPremiumStatus.team.name, team_info_html.body.teamWithEligibilityAndPremiumStatus.team.avatarUrl];
    }
    catch
    {
        try
        {
            return [team_info_html.body.teamWithEligibilityAndPremiumStatus.team.name, "https://s3.amazonaws.com/mlg-gamebattles-production/assets/arenas/avatar/64/775.png?v=3"];
        }
        catch
        {
            try
            {
                return ["Team", team_info_html.body.teamWithEligibilityAndPremiumStatus.team.avatarUrl];
            }
            catch
            {
                return ["Team", "https://s3.amazonaws.com/mlg-gamebattles-production/assets/arenas/avatar/64/775.png?v=3"]; // Default team name and default Overwatch icon image URL
            }
        }
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
        {
            let scouting_string = `SR: ${player_ranks[loop_count].sr}\n${await getHeroesOutputString(original_message, player_ranks[loop_count].top_three_heroes)}` // String that will output for every rank a player has
            
            if(player_ranks.hero_data_is_competitive !== undefined && !player_ranks.hero_data_is_competitive) // If the hero data that was obtained was from quick play, add the disclaimer
                scouting_string += " [QP Data]";

            player_scout_embed.addField(titleCase(player_ranks[loop_count].role), scouting_string);
        }
        player_scout_embed.setFooter("All stats obtained from https://www.overbuff.com/");
    }
    
    await original_message.channel.send(player_scout_embed);
}

// Output a gamebattles team or a team of given battle tags
async function discordOutputTeamPlayerData(original_message, team_name, team_icon_url, team_players_data)
{
    const team_scout_embed = new RichEmbed()
        .setColor('0x6f07ab')
        .setTitle(team_name + " Scouting Information")
        .setThumbnail(team_icon_url)
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
            let current_player_data = current_player.player_data; // The competitive data of the current player

            if(current_player_data == undefined) // If the player's overbuff URL was not able to be parsed...
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
                for(let roles_lc = 0; roles_lc < current_player_data.length; roles_lc++)
                {
                    scouting_string += titleCase(current_player_data[roles_lc].role) + " SR: **" + current_player_data[roles_lc].sr + "** " + await getHeroesOutputString(original_message, current_player_data[roles_lc].top_three_heroes);

                    if(current_player_data[roles_lc].top_three_heroes.length > 0 && !current_player_data[roles_lc].hero_data_is_competitive) // If the hero data that was obtained was from quick play, add the disclaimer
                        scouting_string += " [QP Data]"
                    if(roles_lc < current_player_data.length - 1) // Append a new line character if this is not the last loop
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
            team_scout_embed.addField("TEAM AVERAGE SR", "**" + Math.round((parseInt(top_players_avg_sr) / parseInt(players_counted))) + "** for the team's top " + players_counted + " players.");
        else if(players_counted < 1)
            team_scout_embed.addField("No ranks to calculate average.");
    }
    console.log(`Sending scouting information embed for team ${team_name}`);
    await original_message.channel.send(team_scout_embed);
}

// Will check to make sure the server has emojis for most heroes
async function heroEmojisOnServer(original_message)
{
    let number_of_emojis = 0; // The number of emojis found that
    const minimum_number_of_emojis = 25; // The minimum number of emojis that must be present on the server for this function to return true
    const all_heroes_array = tank_heroes.concat(dps_heroes.concat(support_heroes)); // Array of all heroes

    // For every hero in Overwatch, check to see if the server being posted on has at least minimum_number_of_emojis of Overwatch hero emojis on the server
    for(let loop_count = 0; loop_count < all_heroes_array.length; loop_count++)
    {
        if(number_of_emojis >= minimum_number_of_emojis)
            return true;

        if(await original_message.guild.emojis.find(emoji => emoji.name === all_heroes_array[loop_count]) !== null)
            number_of_emojis++;
    }

    return false;
}


// Get the emoji names for a players top 3 heroes and return them as a printable string
async function getHeroesOutputString(original_message, hero_name_array)
{
    let special_hero_names      = ["d.va", "soldier: 76", "torbjörn", "lúcio", "wrecking ball"]; // Hero names in overbuff that have special characters that cannot exist in Discord emoji names
    let server_hero_emoji_names  = ["dva", "soldier76", "torbjorn", "lucio", "wreckingball"]; // The associated names of the hero emojis used in some servers BlackLight is on

    let hero_emojis_string = ""; // String of every hero emoji to be appended to this role's information
    const use_emojis = await heroEmojisOnServer(original_message); // Checks if there are enough emojis on the server to justify using them in the output

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
            if(use_emojis)
            {
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
            }
            else
                hero_emojis_string += ` **[${titleCase(hero_name_array[i])}]**`;
        }
    }
    
    if(hero_emojis_string == '')
        return "No hero data";

    return `Heroes: ${hero_emojis_string}`;
}