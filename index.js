const Hapi = require('hapi')
const axios = require('axios')
const server = Hapi.Server({
    port: 8000,
    host: 'localhost'
});

const rootURI = 'https://na1.api.riotgames.com'
const apiQuery = '?api_key='
const apiKey = 'RGAPI-796519d2-5bd8-44c4-bd0a-3e0a53db61a0'
const getSummonerInfo = '/lol/summoner/v3/summoners/by-name/'
const getMatchlistsByAccountId = '/lol/match/v3/matchlists/by-account/'
const getMatchInfoByMatchId = '/lol/match/v3/matches/'

server.route({
    method: 'GET',
    path: '/Summoner/{name}',
    handler: async (request, h) => {
        //get accountId from summoner name
        var SummonerName = request.params.name
        var SummonerURI = `${rootURI}${getSummonerInfo}${SummonerName}${apiQuery}${apiKey}`
        summonerResponse = await axios.get(SummonerURI)
        var accountId = summonerResponse.data.accountId

        //get recent matches from accountId
        var getMatchlistsURI = `${rootURI}${getMatchlistsByAccountId}${accountId}${apiQuery}${apiKey}`
        matchListResponse = await axios.get(getMatchlistsURI)


        var matches = matchListResponse.data.matches
        matchCnt = matches.length > 10 ? 10 : matches.length
        summonerStats = new Array(matchCnt)

        //index champion Id and name
        champsResponse = await axios.get('https://ddragon.leagueoflegends.com/cdn/8.20.1/data/en_US/champion.json')
        var champs = champsResponse.data.data
        var champLUT = {}
        for(var champName in champs){
            champLUT[champs[champName].key] = champName
        }

        //get all items data
        itemsResponse = await axios.get('https://ddragon.leagueoflegends.com/cdn/8.20.1/data/en_US/item.json')
        var items = itemsResponse.data.data

        //index spell key and name
        summonerSpellsResponse = await axios.get('https://ddragon.leagueoflegends.com/cdn/8.20.1/data/en_US/summoner.json')
        var spells = summonerSpellsResponse.data.data
        spellLUT = {}
        for(var spell in spells){
            spellLUT[spells[spell].key] = spells[spell].name
        }

        perksResponse = await axios.get('https://ddragon.leagueoflegends.com/cdn/8.20.1/data/en_US/runesReforged.json')
        var perks = perksResponse.data
        var runeLUT = {}
        for(var perk in perks){
            for(var slot in perks[perk].slots){
                for(var rune in perks[perk].slots[slot].runes){
                    runeLUT[perks[perk].slots[slot].runes[rune].id] = perks[perk].slots[slot].runes[rune].key
                }
            }
        }
        for(i = 0; i < matchCnt; i++){
            //get player stats for each match
            var gameId = matches[i].gameId
            var getMatchInfoURI = `${rootURI}${getMatchInfoByMatchId}${gameId}${apiQuery}${apiKey}`
            matchResponse = await axios.get(getMatchInfoURI)
            var matchInfo = matchResponse.data
            gameStats = {}

            gameStats.gameDuration = matchInfo.gameDuration
            playersIdentities = matchInfo.participantIdentities
            player = null
            for(j = 0; j < playersIdentities.length; j++){
                if(playersIdentities[j].player.accountId === accountId){
                    gameStats.summonerName = playersIdentities[j].player.summonerName
                    player = matchInfo.participants[j]
                    break
                }
            }


            gameStats.championName = champLUT[player.championId]

            champResponse = await axios.get(`https://ddragon.leagueoflegends.com/cdn/8.20.1/data/en_US/champion/${gameStats.championName}.json`)

            gameStats.champLevel = player.stats.champLevel
            gameStats.KDA = `${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`
            gameStats.win = player.stats.win
            
            //get each item's name
            for(k = 0; k < 7; k++){
                if(player.stats[`item${k}`] != 0){
                    gameStats[`item${k}`] = items[player.stats[`item${k}`]].name
                }
            }

            //get rune names
            for(l = 0; l < 6; l++){
                gameStats[`perk${l}`] = runeLUT[player.stats[`perk${l}`]]
            }
            
            //get spell names
            gameStats.spell1 = spellLUT[player.spell1Id]
            gameStats.spell2 = spellLUT[player.spell2Id]

            //calculate creep score
            var mins = parseInt(gameStats.gameDuration) / 60 
            var creepScore = 0
            for(var csPerMinDeltas in player.timeline.creepsPerMinDeltas){
                delta = player.timeline.creepsPerMinDeltas[csPerMinDeltas]
                creepScore += parseFloat(delta) * 10
            }
            gameStats.totalCreepScore = creepScore
            gameStats.creepScorePerMin = creepScore / mins

            summonerStats[i] = gameStats

 
        }

        return h.response(summonerStats).header('Content-Type', 'application/json')
    }
})

const init = async () => {
    await server.start();
    console.log(`Server running at: ${server.info.uri}`)
}

process.on('unhandledRejection', (err) => {
    console.log(err)
    process.exit(1)
})

init()