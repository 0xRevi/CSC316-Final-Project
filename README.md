# CSC316-Final-Project
**Team Name: Vis Virtuosos**

## Overview
This repository creates interactive visualizations from daily collection time series of the Global Spotify Top 200 charts from January 1st, 2017 to December 31st, 2024. The visualizations include song, artist, and genre-level specifications for categories of solo vs. collaborative artists, helping users explore and understand the importance of how these factors may influence song popularity within an already popular demographic of songs (that is the Top 200).

Our team collected and preprocessed data from the [external APIs and serivces](#apis-and-services) to curate our datasets and improve artist identification with songs playback, artist and album images. Most of the features in our datasets took inspiration from the works of the [MGD+ Dataset](https://zenodo.org/records/8086643). The remaining visualizaitons used [JavaScript libraries](#javascript-libraries) to format out visualizations and format its organization in the presentation.

## Interactive Visualizations
*NOTE*: All data uses the same collection period as defined in the [overview](#overview). Some visualizations may rely on different ways of grouping our data (e.g. by year or by day).
- **[Song-level] Beeswarm Plot**: Displays the Top 2000 songs on the Spotify Global Top 200 charts split by solo vs. collaborative artists. Each bubble corresponds to a song with sized proportional to its total streams, and positioned by its release date.
- **[Song-level] Bar Chart Race**: Animates the Top 15 most streamed songs on the Spotify Global Top 200 charts using daily increments. The bar chart highlights solo vs. collaborative songs via color encoding,allowing users to adjust the observing period, and plays audio for the day's top ranked song.
- **[Artist-level] Artist Collaboration Network**: Displays how artists are connected through their personalized networks among various years or across all years. Users can search for artists, and annotate up to 200 artists' bubbles which have the most streams for the specified time filter.
- **[Genre-level] Genre Bar Charts**: Displays how solo and collaborative artists fare, in proportion or absolute terms, within the top 10 genres. Users can filter by selected years to observe genre popularity and its relationships to the two groups of artists.

## Tools
### JavaScript Libraries
- d3.js: Used to implement the majority of interactive visualization rendering across our various visualizations.
- fuse.js: Used to implement a suggestive search feature for the aritst network.
- fullpage.js: Used to create a convenient and intuitive layout for webpage interactions when transitioning between our visualizations.
### APIs and Services
The following include a a process to our data collection pipeline
- [Spotify Charts Data](https://charts.spotify.com/home): CSV downloads from the specified interval in the Global Top 200 according to Spotify Track IDs.
- [Spotify Web SDK](https://developer.spotify.com/documentation/web-playback-sdk): Uploading playlists to Spotify, and downloading redirect URLs to artist display photos.
- [Chosic Playlist Analyzer](https://www.chosic.com/spotify-playlist-analyzer/): Using the uploaded playlists from the Spotify Web SDK, Chosic analyzed these playlists to retrieve genre data where available for each song in each year group.
- iTunes API: TODO and hyperlink general docs

## Project Website
- TODO: Insert GitHub Pages link
## Screencast Video
- TODO: Insert Screencast video link.