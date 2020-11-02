/*###########################################################################################################################
#                                               Helper Functions                                                            #
#   Functions that provide additional functionality to various functions                                                    #
###########################################################################################################################*/
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Will convert a given string to 'title case' ("thIs IS a TeSt strIng!" -> "This Is A Test String!")
export function titleCase(str) 
{
    return str.toLowerCase().replace(/(^\w)|(\s\w)/gm, function(t) {return t.toUpperCase()});
}