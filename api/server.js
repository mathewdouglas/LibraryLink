const express = require('express');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();
const path = require('path');
const axios = require('axios');

const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

const app = express();
const port = 3000;

const apiKey = process.env.STEAM_API_KEY; // Load API key from .env file
const steamGridDbApiKey = process.env.STEAMGRIDDB_API_KEY;
const IGDB_CLIENT_ID = 'your_client_id';
const IGDB_ACCESS_TOKEN = 'your_access_token'; // from step 2

const steamId = '76561198213788939'; // Replace with the user's Steam ID
const outputFilePath = './api/userLibrary.json'; // Path to the JSON file

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
    const steamId = req.query.steamid;
    if (!steamId) {
        return res.status(400).send('Steam ID is required');
    }

    console.log('Syncing library for Steam ID:', steamId);

    try {
        const result = await syncLibraryHelper(steamId); // Wait for the helper function to complete
        if (result.success) {
            res.status(200).send(result.message);
        } else {
            res.status(500).send(result.message);
        }
    } catch (error) {
        console.error('Unexpected error in /api/syncLibrary:', error);
        res.status(500).send('Unexpected error occurred while syncing library');
    }
});

async function syncLibraryHelper(steamId) {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;
    const assetsDir = path.join(__dirname, 'assets');

    console.log('Fetching user library from Steam API:', url);

    try {
        const response = await fetch(url);
        const data = await response.json();

        console.log('Response from Steam API:', data);

        if (data && data.response && data.response.games) {
            const games = data.response.games;

            // Ensure the assets directory exists
            if (!fs.existsSync(assetsDir)) {
                fs.mkdirSync(assetsDir, { recursive: true });
            }

            // Fetch and save images for each game
            for (const game of games) {
                const appId = game.appid;
                const localImagePath = path.join(assetsDir, `${appId}.jpg`);
                const localImageUrl = `/api/assets/${appId}.jpg`;

                // Try downloading the image from Steam's CDN
                const steamImageUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
                let imageDownloaded = await downloadImage(steamImageUrl, localImagePath);

                if (!imageDownloaded) {
                    // If Steam's image fails, download from SteamGridDB
                    const steamGridDbImageUrl = await fetchGameImageUrl(appId);
                    imageDownloaded = await downloadImage(steamGridDbImageUrl, localImagePath);

                    if (!imageDownloaded) {
                        console.error(`Failed to download image for App ID ${appId}. Using placeholder image.`);
                        // Use a placeholder image if both downloads fail
                        game.imageUrl = 'https://placehold.co/600x900';
                        continue; // Skip to the next game
                    }
                }

                // Store the local image URL in the game object
                game.imageUrl = localImageUrl;
            }

            // Save the updated game library to a JSON file
            fs.writeFileSync(outputFilePath, JSON.stringify(games, null, 2), 'utf-8');
            console.log(`User library saved to ${outputFilePath}`);
            return { success: true, message: 'User library synced successfully' };
        } else {
            console.error('No games found or invalid response:', data);
            return { success: false, message: 'No games found or invalid response' };
        }
    } catch (error) {
        console.error('Error syncing library:', error);
        return { success: false, message: `Error syncing library` };
    }
}

async function downloadImage(url, filePath) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.log(`Failed to download image from ${url}: ${response.statusText}`);
            return false;
        }

        // Stream the response body to the file
        await streamPipeline(response.body, fs.createWriteStream(filePath));
        // console.log(`Image saved to ${filePath}`);
        return true;
    } catch (error) {
        console.log(`Error downloading image from ${url}:`, error);
        return false;
    }
}

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
                return 'https://placehold.co/600x900'; // Fallback image
            }
        } else {
            console.error(`Error fetching image for App ID ${appId}:`, response.status);
            return 'https://placehold.co/600x900'; // Fallback image
        }
    } catch (error) {
        console.error(`Error fetching image for App ID ${appId}:`, error);
        return 'https://placehold.co/600x900'; // Fallback image
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

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
  
    try {
      const response = await axios.post(
        'https://api.igdb.com/v4/games',
        `search "${query}"; fields name,cover.url; limit 10;`,
        {
          headers: {
            'Client-ID': IGDB_CLIENT_ID,
            'Authorization': `Bearer ${IGDB_ACCESS_TOKEN}`,
            'Accept': 'application/json',
          },
        }
      );
  
      res.json(response.data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch data from IGDB' });
    }
  });
