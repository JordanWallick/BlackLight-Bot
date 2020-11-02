/*###########################################################################################################################
#                                               Call Out Functions                                                          #
#   Contain all functions that make up the functionality of the quiz and learn commands                                     #
###########################################################################################################################*/

// Imports
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
import {titleCase} from './HelperFunctions.js';

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

// Main quiz function
export async function quiz(original_message, map, players)
{
    // First off, check if the map the user provided exists in the files
    try
    {
        answer_array    = getMapAnswerArray(map);
        question_array  = getMapQuestionArray(map);
    }
    catch(error)
    {
        await original_message.channel.send(`Map name "${map}" not found. Type '${COMMAND_DELIM} ${COMMAND_HELP}' for a list of supported maps.`);
        return;
    }

    // Tell the user's that are in the quiz that the game is starting
    let begin_quiz_string = "Starting a quiz for ";
    for(let loop_count = 0; loop_count < players.length; loop_count++)
    {
        if(loop_count > 0)
        {
            begin_quiz_string += ", "

            if(loop_count == players.length - 1)
            {
                begin_quiz_string += "and "
            }
        }
        
        begin_quiz_string += players[loop_count].user.username;
    }
    await original_message.channel.send(`${begin_quiz_string} for the map ${titleCase(map)}!`);

    let answer_array;
    let question_array;
    
    let user_scores = []; // Array that will be 1 to 1 with players to track that user's score in the game
    for(let loop_count = 0; loop_count < players.length; loop_count++)
    {
        user_scores.push(0); // Fill the array with 0's for every player's score
    }
    let max_score = question_array.length + 1; // Max score someone can get in this game
    let loop_count; // For loop counter
    let question_image_file_path; // File path of the current question image
    let call_out; // The current call out that is being quizzed on
    let previous_area; // Used to see if the area of the map being quizzed on has changed
    let current_area; // Used to see if the area of the map being quizzed on has changed

    const area_integer_regex = /^\d+/gm; // Regular expression to find a digit at the beginning of a file name
    const call_out_regex = /([a-zA-Z\-\,])+\.[a-z]+$/gm; // Regular expression to find the call out within the question image file name

    // Run though every call out question image in question_array
    for(loop_count = 0; loop_count < question_array.length; loop_count++)
    {
        try
        {
            question_image_file_path = getQuestionsDir(map) + question_array[loop_count];
            call_out = question_image_file_path.match(call_out_regex)[0].split(".")[0].replace("-", " ") // This disgusting line will just parse out the last part of the file name and trim off the file extension, thus leaving the call out
            let temp = question_array[loop_count].match(area_integer_regex);
            current_area = parseInt(question_array[loop_count].match(area_integer_regex)[0]);

            // Checks if the area of call outs has moved onto the next. Before doing so, the answer key to the previous should be posted.
            if(previous_area == null)
            {
                previous_area = current_area; // Set the previous_area variable if it has yet to be set this quiz
            }
            else if(previous_area != current_area)
            {
                let answer_image_file_path = getAnswersFromInt(getAnswersDir(map), previous_area); // File path the the previous area's answer sheet
                try
                {
                    await original_message.channel.send("Answers:");
                    await original_message.channel.send({files: [{attachment: answer_image_file_path}]}); // Post the answer sheet to the previous area
                    await original_message.channel.awaitMessages(filter, {time: 5000}); // Using this as a timer. Don't judge me.
                }
                catch(error)
                {
                    console.log(`ERROR! Could not send answer sheet with path ${answer_image_file_path}.`);
                }
                previous_area = current_area // Update what the previous area was
            }
        }
        catch(error)
        {
            console.log(`ERROR! Call out from file "${question_image_file_path}" is not valid!`);
            continue;
        }

        await original_message.channel.send({files: [{attachment: question_image_file_path}]}); // Post the next call out question image

        let collected_messages = [] // Will hold all responses to the current question
        let filter = answer_message => answer_message.channel.id == original_message.channel.id; // Filter to ensure only messages in the original channel are taken
        let answer_collector = original_message.channel.createMessageCollector(filter, { time: 5000 }) // Collector that will create async events for message collection

        // Run every time someone responds in the channel the quiz is in during a call out question
        await answer_collector.on('collect', answer_message => {
            console.log(`Collected answer ${answer_message.content}`);
            let add_message_flag = true; // Flag to determine if a message should be added to collected_messages[]
            let index; // For loop variable

            // Check for anyone trying to submit a second answer and disregard their response
            for(index = 0; index < collected_messages.size; index++)
            {
                if(collected_messages[index].author.id == answer_message.author.id)
                {
                    add_message_flag = false;
                    break;
                }
            }

            // If the check determined this is a unique answer for this question
            if(add_message_flag)
            {
                collected_messages.push(answer_message);
            }
        });
        
        // When the collector ends, run this
        await answer_collector.on('end', async m => 
        {
            console.log(`Collected ${m.size} answers.`);
            let messages_processed = []

            // Outer for loop will run though every collected response and react based on correct / incorrect response as well as add to user's scores
            for(let index = 0; index < collected_messages.length; index++)
            {
                let continue_flag = false;
                // Check if the response is from a player that is a part of this game
                for(let inner_index = 0; inner_index < players.length && !continue_flag; inner_index++)
                {
                    if(collected_messages[index].author.id == players[inner_index].user.id)
                    {
                        continue_flag = true;
                    }
                }

                // Check previous messages for repeat authors. Every player gets one guess
                for(let inner_index = 0; inner_index < messages_processed.length && continue_flag; inner_index++)
                {
                    if(collected_messages[index].author.id == messages_processed[inner_index].author.id)
                    {
                        continue_flag = false;
                    }
                }

                // Check if the current message being evaluated was posted by a user that already submitted an answer, skip
                if(!continue_flag)
                {
                    continue;
                }

                let points_to_add = 0; // How many points will be added to each users score

                // If/else will check for the correct call out in the current message
                for(let outer_loop_count = 0; loop_count < players.length; outer_loop_count++)
                {
                    if(collected_messages[index].content.includes(call_out))
                    {
                        await collected_messages[index].react('✅');
                        points_to_add = 1;
                    }
                    else if(await inGameCommands(collected_messages[index]) > 0) // Check if a player paused or quit the quiz
                    {
                        endQuiz(original_message, players, max_score);
                        return;
                    }
                    else
                    {
                        await collected_messages[index].react('❌');
                    }
                }

                // Inner for loop will match the current message's author with the players in the players array and add to their score in the user_scores array
                for(let loop_count = 0; loop_count < players.length; loop_count++)
                {
                    if(players[loop_count].user.id == collected_messages[index].author.id)
                    {
                        user_scores[loop_count] = user_scores[loop_count] + points_to_add;
                        console.log(`Player ${players[loop_count].user.username} is now at ${user_scores[loop_count]}`);
                    }
                }

                messages_processed.push(collected_messages[[index]]); // Add the current message to the array of already processed messages
            }
        });

        await original_message.channel.awaitMessages(filter, {time: 5000}) // Using this as a timer. Don't judge me.
        await original_message.channel.send(`The answer was ${call_out}`);
        await original_message.channel.awaitMessages(filter, {time: 2000}) // Using this as a timer. Don't judge me.
        await answer_collector.stop('Default stop');
    }

    endQuiz(original_message, players, max_score); // End the quiz after all questions have been asked
}

// Learn function will post all answer keys for a specific map
export async function learn(original_message, map)
{
    let answer_array;
    try
    {
        answer_array = getMapAnswerArray(map);
    }
    catch(error)
    {
        await original_message.channel.send(`Map name "${map}" not found. Type '${COMMAND_DELIM} ${COMMAND_HELP}' for a list of supported maps.`);
        return;
    }
    let loop_count;
    let answer_image_file_path;

    for(loop_count = 0; loop_count < answer_array.length; loop_count++)
    {
        answer_image_file_path = getAnswersDir(map) + answer_array[loop_count];
        try
        {
            await original_message.channel.send({files: [{attachment: answer_image_file_path}]}); // Post the answer sheet
        }
        catch(error)
        {
            console.log(`ERROR! Could not send answer sheet with path ${answer_image_file_path} .`);
        }
    }
}

// Will wait for users to respond to a message and compile all of their author id's into an array
export async function getPlayers(original_message)
{
    await original_message.channel.send("Say something within 5 seconds of this message to be part of the quiz!");
    let players = [] // Will hold all players (as a discord.js User)
    players.push({user:await thisBot.fetchUser(original_message.author.id), score: 0}); // Add the user who issued the command as the first in the array

    let filter = answer_message => answer_message.channel.id == original_message.channel.id; // Filter to ensure only messages in the original channel are taken
    let player_collector = original_message.channel.createMessageCollector(filter, { time: 5000 }) // Collector that will create async events for message collection

    // Run every time someone responds in the channel the quiz is in during a call out question
    await player_collector.on('collect', async player_message => {
        let user = await thisBot.fetchUser(player_message.author.id);
        let add_user_flag = true; // Flag that will be used to see if a user should be added to the players[] array
        let index;

        // Ensure no duplicate messages add duplicate users to the game
        for(index = 0; index < players.length; index++)
        {
            if(user.id == players[index].user.id)
            {
                add_user_flag = false;
                break;
            }
        }

        // If this user has yet to be added to the array, add and log them
        if(add_user_flag)
        {
            players.push({user: user, score: 0});
            console.log(`Player ${user.username} added to game`);
        }
    });
    
    // When the collector ends, run this
    await player_collector.on('end', m => 
    {
        console.log(`Collected ${players.length} players.`);
    });

    await original_message.channel.awaitMessages(filter, {time: 5000})
    await player_collector.stop('Default stop');
    return players;
}

// Returns an array of map's question photo file names
function getMapQuestionArray(map)
{
    let question_array = [];
    let file_path;

    for(file_path of fs.readdirSync(getQuestionsDir(map)))
    {
        question_array.push(file_path);
    }
    return question_array;
}

// Returns an array of map's answer key photo file names
function getMapAnswerArray(map)
{
    let answer_array = [];
    let file_path;

    for(file_path of fs.readdirSync(getAnswersDir(map)))
    {
        answer_array.push(file_path);
    }
    return answer_array;
}

// Will resolve the map's questions directory
function getQuestionsDir(map)
{
    let resolved_file_path = path.resolve(`./callout_assets/${map}/questions/`);
    let loop_count;
    for(loop_count = 0; loop_count < 10; loop_count++)
    {
        resolved_file_path = resolved_file_path.replace(String.fromCharCode(92), "/");
    }
    return resolved_file_path + "/";
}

// Will resolve the map's answers directory
function getAnswersDir(map)
{
    let resolved_file_path = path.resolve(`./callout_assets/${map}/answers/`);
    let loop_count;
    for(loop_count = 0; loop_count < 10; loop_count++)
    {
        resolved_file_path = resolved_file_path.replace(String.fromCharCode(92), "/");
    }
    return resolved_file_path + "/";
}

// Will grab an answer sheet givin an integer
function getAnswersFromInt(answers_file_path, given_integer)
{
    const area_integer_regex = /^\d+/gm;
    answer_files = fs.readdirSync(answers_file_path)
    return_file = null;

    for(let file_name of answer_files)
    {
        if(parseInt(file_name.match(area_integer_regex)) == parseInt(given_integer))
        {
            return answers_file_path + file_name;
        }
    }
    
    return null;
}

// Will parse a message for any command that can be used during a game
async function inGameCommands(message)
{
    if(message.content.contains(`${COMMAND_DELIM} ${COMMAND_PAUSE_QUIZ}`))
    {
        let filter = m => m.content.includes(`${COMMAND_DELIM} ${COMMAND_PAUSE_QUIZ}`)
        await message.channel.send(`Game paused for 5 minutes. Type '${COMMAND_DELIM} ${COMMAND_RESUME_QUIZ}' to continue the quiz.`).then(() => 
        {
            message.channel.awaitMessages(filter, {max: 1, time: 300000, errors: ['time']})
            .then(collected => 
            {
                message.channel.send("Game resuming...");
                return 0;
            })
            .catch(collected =>
            {
                message.channel.send("Game pause timeout reached. Game ending...");
                return 1;
            });
        }
        );
    }
    if(message.content.contains(`${COMMAND_DELIM} ${COMMAND_PAUSE_QUIZ}`))
    {
        await message.channel.send("Game ending...");
        return 1;
    }

    return -1;
}

//Sort players based on scores. Yes this is using a bubble sort. No I do not care.
function sortPlayerScore(players)
{
    let n = players.length
    for(let i = 0; i < (n-1); i++)
    {
        for(let j = 0; j < (n-i-1); j++)
        {
            if(players[j].score > players[j+1].score)
            {
                let place_holder_player = players[j];
                players[j] = players[j+1];
                players[j+1] = place_holder_player;
            }
        }
    }
}

// Returns true if the guess is exactly correct or is a synonym of the correct answer (list of synonyms in )
function checkGuess(correct_word, given_word)
{
    if(correct_word.localCompare(given_word) == 0)
    {
        return true;
    }
    else
    {
        // <TBD> Check if there are any synonym matches
        return false;
    }
}

async function endQuiz(original_message, players, max_score)
{
    // Run this last block of code when the game is over with. Display scores and the winner.
    let game_end_string = "The Quiz is over!\n";
    if(players.length > 1) // If there were more than one player, print out the scoreboard
    {
        players = sortPlayerScore(players);
        game_end_string += `${players[0].user.username} had the best score with ${players[0].score}/${max_score}\n\nScoreboard:`;

        for(let loop_count = 0; loop_count < players.length; loop_count++)
        {
            game_end_string += `\n${players[loop_count].user.username}: ${players[loop_count].score}/${max_score}`;
        }
    }
    else // Print out the user's score if they played alone
    {
        game_end_string += `Final score: ${players[0].score}"/${max_score}.`;
    }

    await original_message.channel.send(game_end_string);
}