const express = require('express');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = 3000;

const apiKey = process.env.STEAM_API_KEY; // Load API key from .env file
const steamGridDbApiKey = process.env.STEAMGRIDDB_API_KEY;
const steamId = '76561198213788939'; // Replace with the user's Steam ID
const outputFilePath = './userLibrary.json'; // Path to the JSON file

app.use(cors());

app.get('/api/getGameDetails', async (req, res) => {
    const appId = req.query.appid;
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=en`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching from Steam API:', error);
        res.status(500).send('Error fetching game data');
    }
});

app.listen(port, () => {
    console.log(`Proxy server running at http://localhost:${port}`);
});


app.get('/api/syncLibrary', async (req, res) => {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.response && data.response.games) {
            const games = data.response.games;

            // Fetch image URLs for each game
            for (const game of games) {
                const appId = game.appid;
                const imageUrl = await fetchGameImageUrl(appId); // Fetch the image URL
                game.imageUrl = imageUrl; // Add the image URL to the game object
            }

            // Save the updated game library to a JSON file
            fs.writeFileSync(outputFilePath, JSON.stringify(games, null, 2), 'utf-8');
            console.log(`User library saved to ${outputFilePath}`);
            res.status(200).send('User library synced successfully');
        } else {
            console.error('No games found or invalid response:', data);
            res.status(500).send('No games found or invalid response');
        }
    } catch (error) {
        console.error('Error fetching user library:', error);
        res.status(500).send('Error fetching user library');
    }
});

// Helper function to fetch the image URL from SteamGridDB
async function fetchGameImageUrl(appId) {
    const url = `https://www.steamgriddb.com/api/v2/grids/steam/${appId}?limit=1&dimensions=600x900`;
    try {
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${steamGridDbApiKey}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.data.length > 0) {
                return data.data[0].url; // Return the first available image URL
            } else {
                console.error(`No image found for App ID ${appId}`);
                return 'https://via.placeholder.com/600x900?text=No+Image'; // Fallback image
            }
        } else {
            console.error(`Error fetching image for App ID ${appId}:`, response.status);
            return 'https://via.placeholder.com/600x900?text=No+Image'; // Fallback image
        }
    } catch (error) {
        console.error(`Error fetching image for App ID ${appId}:`, error);
        return 'https://via.placeholder.com/600x900?text=No+Image'; // Fallback image
    }
}

app.get('/api/getSteamGridDbImage', async (req, res) => {
    const appId = req.query.appid;
    if (!appId) {
        return res.status(400).send('App ID is required');
    }

    const url = `https://www.steamgriddb.com/api/v2/grids/steam/${appId}?limit=1&dimensions=600x900`;
    try {
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${steamGridDbApiKey}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.data[0].id > 0) {
                // Fetch the image for the game
                const imageUrl = data.data[0].url;
                    return res.status(200).json({ imageUrl }); // Return the image URL
                   
            } else {
                return res.status(404).send('No matching game found on SteamGridDB');
            }
        } else {
            console.error('Error fetching from SteamGridDB:', response.status);
            return res.status(response.status).send('Error fetching from SteamGridDB');
        }
    } catch (error) {
        console.error('Error fetching SteamGridDB image:', error);
        res.status(500).send('Error fetching SteamGridDB image');
    }
});
