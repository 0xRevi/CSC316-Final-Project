# CSC316-Final-Project

**Team Name: Vis Virtuosos**

## Overview

This repository creates interactive visualizations from daily collection time series of the Global Spotify Top 200 charts from January 1st, 2017 to December 31st, 2024. The visualizations include song, artist, and genre-level specifications for categories of solo vs. collaborative artists, helping users explore and understand the importance of how these factors may influence song popularity within an already popular demographic of songs (that is the Top 200).

Our team collected and preprocessed data from the [external APIs and serivces](#apis-and-services) to curate our datasets and improve artist identification with songs playback, artist and album images. Most of the features in our datasets took inspiration from the works of the [MGD+ Dataset](https://zenodo.org/records/8086643). The remaining visualizaitons used [JavaScript libraries](#javascript-libraries) to format our visualizations and format its organization in the presentation.

## Interactive Visualizations

_NOTE_: All data uses the same collection period as defined in the [overview](#overview). Some visualizations may rely on different ways of grouping our data (e.g. by year or by day).

-   **[Song-level] Beeswarm Plot**: Displays the Top 2000 songs on the Spotify Global Top 200 charts split by solo vs. collaborative artists. Each bubble corresponds to a song with sized proportional to its total streams, and positioned by its release date.
-   **[Song-level] Bar Chart Race**: Animates the Top 15 most streamed songs on the Spotify Global Top 200 charts using daily increments. The bar chart highlights solo vs. collaborative songs via color encoding,allowing users to adjust the observing period, and plays audio for the day's top ranked song.
-   **[Artist-level] Artist Collaboration Network**: Displays how artists are connected through their personalized networks among various years or across all years. Users can search for artists, and annotate up to 200 artists' bubbles which have the most streams for the specified time filter.
-   **[Genre-level] Genre Bar Charts**: Displays how solo and collaborative artists fare, in proportion or absolute terms, within the top 10 genres. Users can filter by selected years to observe genre popularity and its relationships to the two groups of artists.


## Non-obvious Features

Beyond the main interactive visualizations, our project includes several subtle design features that enhance user experience and engagement:

### Title Page Head Interaction

- Artist images float around the screen and react to cursor movement. Hovering scales them up slightly, while getting close causes them to move away from the mouse.

### Tooltips

Each visualization provides dynamic tooltips to deliver deeper insight on hover:

- **Beeswarm Plot**: Displays the song name, artist (with release year), and total number of streams.
- **Artist Collaboration Network**: Shows artist name, stream-based rank, number of charting songs, and number of unique collaborators.
- **Genre Bar Chart**: Displays the selected year, genre, and the solo/collab percentage.

### Artist Network

- The Artist Collaboration Network includes a toggle switch to alternate between:
    - **Artist View**: Shows interactive artist bubbles with ranking and collaboration info.
    - **Instruction View**: Provides a guide on how to navigate and interact with the network.
- To search artists by name, users can type in the top-left text field and navigate up and down populated suggestions from fuse.js with arrow keys. Users can also press ENTER to submit and modify the view to their liking
- The search history for arists follows more of a log format rather than a "search history". The histories are also specific to the filters we have (e.g. 2024 has a search history, 2023 has a distinct search history, etc.)
- The "x" button in the artist view removes the currently focused artist from the view and reverts the view to the default (with zoom-to-fit)

## Tools

### JavaScript Libraries

-   [d3.js (V7.8.2)](https://d3js.org/): Used to implement the majority of interactive visualization rendering across our various visualizations.
-   [fuse.js (V7.1.0)](https://www.fusejs.io/): Used to implement a suggestive search feature for the aritst network.
-   [fullpage.js (V4.0.20)](https://alvarotrigo.com/fullPage/#page2): Used to create a convenient and intuitive layout for webpage interactions when transitioning between our visualizations.

### APIs and Services

The following include a a process to our data collection pipeline

-   [Spotify Charts Data](https://charts.spotify.com/home): CSV downloads from the specified interval in the Global Top 200 according to Spotify Track IDs.
-   [Spotify Web SDK](https://developer.spotify.com/documentation/web-playback-sdk): Uploading playlists to Spotify, and downloading redirect URLs to artist display photos.
-   [Chosic Playlist Analyzer](https://www.chosic.com/spotify-playlist-analyzer/): Using the uploaded playlists from the Spotify Web SDK, Chosic analyzed these playlists to retrieve genre data where available for each song in each year group.
-   [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html): Used to search for song previews by track name and artist. The API returns metadata including audio preview URLs which are then downloaded and stored locally.


## Code Attribution

We wrote all files in this repository as external libraries were imported via CDN links.

## Project Website

-   [GitHub Pages Link](https://0xrevi.github.io/CSC316-Final-Project/)

## Screencast Video

-   [Screencast video](https://drive.google.com/file/d/1BOwsgRXNHcBh9QuI2WNdeYA-m1Y9g1-k/view?usp=sharing)
