const SPOTIFY_GREEN = "#1DB954";
const SELECTED_NODE_COLOR = "#ff4500";

class ArtistNetworkGraph {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.currentYear = null;
    this.dataCache = {};

    // Graph state configuration
    this.state = {
      svg: null,
      graphGroup: null,
      width: null,
      height: null,
      zoom: null,
      tooltip: null,
      globalLinks: [],
      globalNodes: [],
      nodeElements: null,
      linkElements: null,
      overlayElements: null,
      labelElements: null,
      globalColorScale: null,
      selectedNode: null,
      songDataMap: {},
      userInteracted: false,
      artistTable: null,
      topKTable: null,
      selectionHistory: [],
      historyIndex: -1,
      radiusScale: null,
      historyByYear: {}
    };
  }

  /* =========================
     Initialization Methods
  ========================= */
  init() {
    const { svg, graphGroup, width, height } = this.createSVGContainer();
    Object.assign(this.state, { svg, graphGroup, width, height });
    this.state.zoom = this.setupZoom(svg, graphGroup);
    this.state.tooltip = this.createTooltip();

    this.disableFullPageScrolling();
    this.bindSVGBackgroundClick();
    this.setupUIControls();

    const initialYear = this.options.initialYear || "2024";
    this.loadData(initialYear);
  }

  disableFullPageScrolling() {
    this.container.on("mouseenter", () => {
      if (window.fullpage_api) fullpage_api.setAllowScrolling(false);
    }).on("mouseleave", () => {
      if (window.fullpage_api) fullpage_api.setAllowScrolling(true);
    });
  }

  bindSVGBackgroundClick() {
    this.state.svg.on("click", event => {
      if (["svg", "rect"].includes(event.target.tagName)) {
        this.resetVisualization();
      }
    });
  }

  createSVGContainer() {
    const size = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.6);
    const svg = this.container.append("svg")
      .attr("viewBox", `0 0 ${size} ${size}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("width", "100%")
      .style("height", "100%")
      .style("background-color", "transparent");

    svg.node().addEventListener("wheel", event => event.preventDefault(), { passive: false });
    svg.append("rect")
      .attr("width", size)
      .attr("height", size)
      .attr("fill", "transparent");
    const graphGroup = svg.append("g")
      .attr("transform", `translate(${size / 2}, ${size / 2})`);
    return { svg, graphGroup, width: size, height: size };
  }

  setupZoom(svg, graphGroup) {
    const zoom = d3.zoom()
      .scaleExtent([0.1, 3])
      .translateExtent([[-Infinity, -Infinity], [Infinity, Infinity]])
      .constrain(transform => transform)
      .on("zoom", event => graphGroup.attr("transform", event.transform));
    svg.call(zoom);
    zoom.on("start", () => { this.state.userInteracted = true; });
    return zoom;
  }

  createTooltip() {
    return d3.select("body")
      .append("div")
      .attr("class", "tooltip")
      .style("opacity", 0);
  }

  /* =========================
     Data Loading Methods
  ========================= */
  loadData(year) {
    if (this.currentYear === year) {
      console.log("Year is already populated.");
      return;
    }
    this.currentYear = year;
    if (!this.state.historyByYear[year]) {
      this.state.historyByYear[year] = { history: [], index: -1 };
    }
    const startOverall = performance.now();

    if (this.dataCache[year]) {
      console.log(`Using cached data for year ${year}`);
      const { nodes, links, radiusScale, colorScale, songDataMap } = this.dataCache[year];
      this.finalizeDataLoad(nodes, links, radiusScale, colorScale, songDataMap, startOverall);
      return;
    }

    const availableYears = ["2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"];
    const filesToLoad = (year === "all")
      ? availableYears.map(y => `data/artist_network/global-artist_network-${y}.csv`)
      : [`data/artist_network/global-artist_network-${year}.csv`];

    const networkPromise = Promise.all(filesToLoad.map(file => d3.dsv(",", file)));
    const songCSVPromise = (year === "all")
      ? d3.csv("data/chosic/chosic_all_time.csv")
      : d3.csv(`data/chosic/${year}-chosic.csv`);

    Promise.all([networkPromise, songCSVPromise])
      .then(([datasets, csvRows]) => {
        const { nodes, links, radiusScale, colorScale } = this.processData(datasets);

        // Build songDataMap using updated CSV header names.
        const songDataMap = {};
        csvRows.forEach(row => {
          const key = row.spotify_track_id || row.song_id;
          const streams = row.yearly_streams ? +row.yearly_streams :
            (row.all_time_streams ? +row.all_time_streams : 0);
          songDataMap[key] = {
            spotify_track_id: row.spotify_track_id,
            song_name: row.song_name,      // updated header name
            artist_names: row.artist_names, // updated header name
            album: row.album,
            album_date: row.album_date,
            streams,
            release_date: row.release_date,
            years_on_chart: row.years_on_chart
          };
        });

        this.dataCache[year] = { nodes, links, radiusScale, colorScale, songDataMap };
        this.finalizeDataLoad(nodes, links, radiusScale, colorScale, songDataMap, startOverall);
      })
      .catch(error => console.error("Error loading data:", error));
  }

  finalizeDataLoad(nodes, links, radiusScale, colorScale, songDataMap, startOverall) {
    Object.assign(this.state, {
      globalLinks: links,
      globalNodes: nodes,
      globalColorScale: colorScale,
      songDataMap
    });

    // Compute cumulative streams for each node
    nodes.forEach(node => {
      node.totalStreams = (node.song_ids || []).reduce((sum, songID) => {
        const songData = songDataMap[songID];
        return sum + (songData && songData.streams ? songData.streams : 0);
      }, 0);
    });

    // Clear previous graph and create new graph
    this.state.graphGroup.selectAll("*").remove();
    this.createGraph(nodes, links, radiusScale, colorScale);
    console.log(`Total render time for ${this.currentYear}: ${performance.now() - startOverall} ms`);


  // // Update the active year button style
  // d3.selectAll(".year-button").classed("active", false);
  // d3.select(`.year-button[data-year="${this.currentYear}"]`).classed("active", true);
  
  // // Create new graph elements
  // this.createGraph(nodes, links, radiusScale, colorScale);
  // console.log(`Total render time for ${this.currentYear}: ${performance.now() - startOverall} ms`);
  
  // // If there is a pending history highlight from navigation, apply it
  // if (this.pendingHighlight) {
  //   this.highlightNeighbors(this.pendingHighlight);
  //   this.pendingHighlight = null;
  // }


  }

  processData(datasets) {
    const allLinks = [];
    datasets.forEach(data => {
      data.forEach(d => {
        // For global artist network, handle both previous and new formatting for song_ids.
        let songs = [];
        try {
          // Try to parse as JSON if the string is formatted as a list.
          songs = JSON.parse(d.song_ids.replace(/'/g, '"'));
          if (!Array.isArray(songs)) {
            songs = d.song_ids.split(",").map(s => s.trim());
          }
        } catch (e) {
          // If JSON parsing fails, assume it's a comma-separated list.
          songs = d.song_ids.split(",").map(s => s.trim());
        }
        const existingLink = allLinks.find(link =>
          (link.source === d.artist_1 && link.target === d.artist_2) ||
          (link.source === d.artist_2 && link.target === d.artist_1)
        );
        if (existingLink) {
          existingLink.linkValue += +d.count;
          existingLink.songIDs = Array.from(new Set(existingLink.songIDs.concat(songs)));
        } else {
          allLinks.push({
            source: d.artist_1,
            target: d.artist_2,
            linkValue: +d.count,
            songIDs: songs
          });
        }
      });
    });

    const nodeIds = Array.from(new Set(allLinks.flatMap(d => [d.source, d.target])));
    const nodes = nodeIds.map(id => ({ id }));
    const degreeMap = {};
    const songMap = {};

    allLinks.forEach(link => {
      const { source, target, songIDs } = link;
      degreeMap[source] = (degreeMap[source] || 0) + 1;
      degreeMap[target] = (degreeMap[target] || 0) + 1;
      songMap[source] = songMap[source] || new Set();
      songMap[target] = songMap[target] || new Set();
      songIDs.forEach(song => {
        songMap[source].add(song);
        songMap[target].add(song);
      });
    });

    nodes.forEach(d => {
      d.degree = degreeMap[d.id] || 0;
      d.songCount = songMap[d.id] ? songMap[d.id].size : 0;
      d.song_ids = [];
    });

    allLinks.forEach(link => {
      link.songIDs.forEach(songID => {
        const sourceNode = nodes.find(n => n.id === link.source);
        const targetNode = nodes.find(n => n.id === link.target);
        if (sourceNode && !sourceNode.song_ids.includes(songID)) {
          sourceNode.song_ids.push(songID);
        }
        if (targetNode && !targetNode.song_ids.includes(songID)) {
          targetNode.song_ids.push(songID);
        }
      });
    });

    const degreeExtent = d3.extent(nodes, d => d.degree);
    const radiusScale = d3.scaleLinear().domain(degreeExtent).range([8, 20]);
    const colorScale = d3.scaleSequential(d3.interpolateViridis).domain(degreeExtent);
    return { nodes, links: allLinks, radiusScale, colorScale };
  }

  /* =========================
     Graph Rendering Methods
  ========================= */
  createGraph(nodes, links, radiusScale, colorScale) {
    const { width, graphGroup, tooltip, svg } = this.state;
    const maxLinkValue = d3.max(links, d => d.linkValue);
    const strokeScale = d3.scaleLinear().domain([0, maxLinkValue]).range([1, 5]).clamp(true);
    this.state.userInteracted = false;

    // Compute node positions via force simulation if not precomputed
    if (!nodes[0].x) {
      const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).strength(d => d.linkValue * 0.1))
        .force("radial", d3.forceRadial(Math.min(width, this.state.height) / 4, width / 2, this.state.height / 2).strength(0.3))
        .force("charge", d3.forceManyBody().strength(-1000))
        .force("center", d3.forceCenter(width / 2, this.state.height / 2))
        .force("x", d3.forceX(width / 2).strength(0.05))
        .force("y", d3.forceY(this.state.height / 2).strength(0.05))
        .alphaDecay(0.08)
        .alphaMin(0.02);
      simulation.stop();
      for (let i = 0; i < 300; i++) simulation.tick();
      console.log("Simulation ticks ran to compute positions.");
    }

    this.state.linkElements = graphGroup.append("g")
      .selectAll("line")
      .data(links)
      .enter().append("line")
      .attr("stroke", "#aaa")
      .attr("stroke-width", d => strokeScale(d.linkValue))
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y)
      .style("opacity", 0);

    this.state.nodeElements = graphGroup.append("g")
      .selectAll("circle")
      .data(nodes)
      .enter().append("circle")
      .attr("r", d => radiusScale(d.degree))
      .style("fill", d => colorScale(d.degree))
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .style("opacity", 0)
      .on("mouseover", (event, d) => {
        tooltip.transition().duration(200).style("opacity", 0.9);
        tooltip.html(`<strong>${d.id}</strong><br/>Collaborators: ${d.degree}<br/>Songs: ${d.songCount || 0}`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", () => tooltip.transition().duration(500).style("opacity", 0))
      .on("click", (event, d) => {
        event.stopPropagation();
        this.state.userInteracted = true;
        this.highlightNeighbors(d);
      });
    this.state.nodeElements.transition().duration(800).style("opacity", 1);

    this.state.overlayElements = graphGroup.append("g")
      .selectAll("circle")
      .data(nodes)
      .enter().append("circle")
      .attr("class", "overlay")
      .attr("r", d => radiusScale(d.degree) + 4)
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .style("fill", "none")
      .style("stroke", "gold")
      .style("stroke-width", "2px")
      .style("opacity", 0);

    // Save radiusScale for later use
    this.state.radiusScale = radiusScale;

    this.fitGraphToSVG(true);
    this.updateZoomExtentWithNetworkBounds(50);
  }

  /* =========================
     Node Highlighting & Interaction
  ========================= */
  highlightNeighbors(selected) {
    this.state.selectedNode = selected;
    this.pushToHistory(selected);

    // Determine connected nodes
    const connectedNodes = new Set([selected.id]);
    this.state.globalLinks.forEach(link => {
      const sourceID = typeof link.source === "object" ? link.source.id : link.source;
      const targetID = typeof link.target === "object" ? link.target.id : link.target;
      if (sourceID === selected.id || targetID === selected.id) {
        connectedNodes.add(sourceID);
        connectedNodes.add(targetID);
      }
    });

    // Highlight edges within the connected network
    this.state.linkElements
      .style("opacity", d => {
        const sourceID = typeof d.source === "object" ? d.source.id : d.source;
        const targetID = typeof d.target === "object" ? d.target.id : d.target;
        return (sourceID === selected.id || targetID === selected.id) ? 1 : 0;
      })
      .attr("stroke", d => {
        const sourceID = typeof d.source === "object" ? d.source.id : d.source;
        const targetID = typeof d.target === "object" ? d.target.id : d.target;
        return (connectedNodes.has(sourceID) && connectedNodes.has(targetID))
          ? SPOTIFY_GREEN
          : "#aaa";
      });

    // Highlight connected nodes and fade out others
    this.state.nodeElements
      .style("opacity", d => connectedNodes.has(d.id) ? 1 : 0.1)
      .style("fill", d => {
        if (d.id === selected.id) {
          return SELECTED_NODE_COLOR;
        } else if (connectedNodes.has(d.id)) {
          return SPOTIFY_GREEN;
        } else {
          return this.state.globalColorScale(d.degree);
        }
      });

    // Update dynamic labels for connected nodes
    this.state.graphGroup.select(".dynamic-labels").remove();
    this.state.graphGroup.append("g")
        .attr("class", "dynamic-labels")
        .selectAll("text")
        .data(this.state.globalNodes.filter(d => connectedNodes.has(d.id)))
        .enter().append("text")
        .attr("class", "artist-label")
        .attr("dx", d => this.state.radiusScale(d.degree) + 4)
        .attr("dy", 4)
        .text(d => d.id)
        .style("font-size", "10px")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .style("fill", "#fff")
        .style("opacity", 1)
        .style("pointer-events", "auto")
        .on("mouseover", function() {
          d3.select(this).style("fill", "#ff4500");
        })
        .on("mouseout", function() {
          d3.select(this).style("fill", "#fff");
        });

    this.updateInfoPanel(selected, [...connectedNodes].filter(id => id !== selected.id));
    this.zoomToNodeAndNeighbors(selected, connectedNodes);
  }

  resetVisualization() {
    this.state.selectedNode = null;
    this.state.nodeElements
      .style("opacity", 1)
      .style("fill", d => this.state.globalColorScale(d.degree));

    this.state.linkElements
      .style("opacity", 0)
      .style("pointer-events", "none")
      .attr("stroke", "#aaa");

    this.state.graphGroup.select(".dynamic-labels").remove();
    this.clearInfoPanel();
  }

  /* =========================
     Info Panel & Table Methods
  ========================= */
  updateInfoPanel(artist, collaboratorIDs) {
    const panel = d3.select("#info-panel");
    panel.html("");

    // Card Container
    const card = panel.append("div")
      .attr("class", "artist-card")
      .style("background-color", "#212121")
      .style("border", "1px solid #333")
      .style("border-radius", "8px")
      .style("padding", "16px")
      .style("margin-bottom", "20px")
      .style("font-family", "'Montserrat', sans-serif");

    // Header with photo, artist name/rank, and navigation buttons
    const header = card.append("div")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "space-between")
      .style("margin-bottom", "16px");

    const leftSection = header.append("div")
      .style("display", "flex")
      .style("align-items", "center");

    leftSection.append("img")
      .attr("src", "img/artist_network/default_artist.png")
      .style("width", "80px")
      .style("height", "80px")
      .style("border-radius", "50%")
      .style("object-fit", "cover")
      .style("margin-right", "16px");

    const textContainer = leftSection.append("div");
    textContainer.append("h2")
      .text(artist.id)
      .style("margin", "0")
      .style("color", "#fff")
      .style("font-size", "24px");

    // Compute artist rank based on total streams
    const sortedByStreams = this.state.globalNodes.slice().sort((a, b) => b.totalStreams - a.totalStreams);
    const artistRank = sortedByStreams.findIndex(n => n.id === artist.id) + 1;
    textContainer.append("p")
      .text(`Rank by total streams: #${artistRank}`)
      .style("margin", "4px 0 0 0")
      .style("color", "#ccc")
      .style("font-size", "14px");

    // Navigation Buttons
    const navContainer = header.append("div")
      .style("display", "flex")
      .style("align-items", "center");

    navContainer.append("button")
      .attr("id", "back-button")
      .text("←")
      .style("margin-right", "8px")
      .style("cursor", "pointer")
      .style("padding", "6px 12px")
      .style("border", "none")
      .style("border-radius", "4px")
      .style("background-color", "#333")
      .style("color", "#fff")
      .on("click", () => this.goBack());

    navContainer.append("button")
      .attr("id", "forward-button")
      .text("→")
      .style("cursor", "pointer")
      .style("padding", "6px 12px")
      .style("border", "none")
      .style("border-radius", "4px")
      .style("background-color", "#333")
      .style("color", "#fff")
      .on("click", () => this.goForward());

    this.updateBackForwardButtons();

    // Meta Info: Collaborators and Song Count
    const metaSection = card.append("div")
      .style("margin-bottom", "16px");

    metaSection.append("p")
      .style("margin", "4px 0")
      .style("color", "#fff")
      .style("font-size", "14px")
      .text(`Collaborators: ${artist.degree}`);

    metaSection.append("p")
      .style("margin", "4px 0")
      .style("color", "#fff")
      .style("font-size", "14px")
      .text(`Song Count: ${artist.song_ids?.length || 0}`);

    card.append("hr")
      .style("border", "none")
      .style("border-top", "1px solid #444")
      .style("margin", "16px 0");

    // Build the song details table
    this.updateArtistDetailsTable(artist);
  }

  clearInfoPanel() {
    d3.select("#info-panel").html("");
  }

  updateArtistDetailsTable(artist) {
    // Get all songs from the dataset
    const allSongs = Object.values(this.state.songDataMap);
    
    // Filter songs to include any that list the selected artist in their "artist_names" field.
    // This handles cases where multiple artists are comma separated.
    const songs = allSongs.filter(songData => {
      if (!songData.artist_names) return false;
      const artistNames = songData.artist_names.split(",").map(a => a.trim().toLowerCase());
      return artistNames.includes(artist.id.toLowerCase());
    }).map(songData => {
      // Include songID from either spotify_track_id or song_id
      const songID = songData.spotify_track_id || songData.song_id;
      if (this.currentYear === "all") {
        return {
          songID,
          songName: songData.song_name,
          artist: songData.artist_names,
          releaseDate: songData.release_date,
          yearsOnChart: this.formatYearsOnChart(songData.years_on_chart)
        };
      } else {
        return {
          songID,
          songName: songData.song_name,
          artist: songData.artist_names,
          releaseDate: songData.release_date
        };
      }
    });
  
    // Initialize table state if necessary
    if (!this.state.artistTable) {
      this.state.artistTable = {
        currentPage: 1,
        rowsPerPage: 10,
        sortKey: 'songName',
        sortOrder: 'asc'
      };
    }
    const tableState = this.state.artistTable;
    
    // Sort the songs based on the current sort key and order
    songs.sort((a, b) => {
      if (tableState.sortKey === 'songName') {
        return tableState.sortOrder === 'asc' ? d3.ascending(a.songName, b.songName) : d3.descending(a.songName, b.songName);
      } else if (tableState.sortKey === 'releaseDate') {
        return tableState.sortOrder === 'asc' ? d3.ascending(a.releaseDate, b.releaseDate) : d3.descending(a.releaseDate, b.releaseDate);
      } else if (tableState.sortKey === 'artist') {
        return tableState.sortOrder === 'asc' ? d3.ascending(a.artist, b.artist) : d3.descending(a.artist, b.artist);
      }
    });
  
    // Pagination setup
    const totalPages = Math.ceil(songs.length / tableState.rowsPerPage);
    tableState.currentPage = Math.max(1, Math.min(tableState.currentPage, totalPages));
    const startIndex = (tableState.currentPage - 1) * tableState.rowsPerPage;
    const pageData = songs.slice(startIndex, startIndex + tableState.rowsPerPage);
  
    // Clear any existing details and create a new details container
    d3.select("#info-panel").select(".artist-details").remove();
    const detailsDiv = d3.select("#info-panel").append("div").attr("class", "artist-details");
    detailsDiv.append("h4").text(`Song Details for ${artist.id}`);
  
    // Build the table
    const table = detailsDiv.append("table")
      .attr("class", "artist-details-table")
      .style("width", "100%");
    const thead = table.append("thead");
    const tbody = table.append("tbody");
  
    // Define the headers for the table including the new Song ID column
    const headers = [
      { label: "Song ID", sortKey: null },
      { label: "Song Name", sortKey: "songName", defaultSortOrder: "asc" },
      { label: "Artist", sortKey: "artist", defaultSortOrder: "asc" },
      { label: "Release Date", sortKey: "releaseDate", defaultSortOrder: "asc" }
    ];
    if (this.currentYear === "all") {
      headers.push({ label: "Years on Chart", sortKey: null });
    }
  
    // Create header row with clickable sorting for sortable headers
    const headerRow = thead.append("tr");
    headers.forEach(header => {
      const th = headerRow.append("th")
        .text(header.label)
        .style("cursor", header.sortKey ? "pointer" : "default");
      if (header.sortKey) {
        th.on("click", () => {
          if (tableState.sortKey === header.sortKey) {
            tableState.sortOrder = tableState.sortOrder === "asc" ? "desc" : "asc";
          } else {
            tableState.sortKey = header.sortKey;
            tableState.sortOrder = header.defaultSortOrder || "asc";
          }
          tableState.currentPage = 1;
          this.updateArtistDetailsTable(artist);
        });
      }
    });
  
    // Populate table rows with song data
    pageData.forEach(song => {
      const row = tbody.append("tr");
      // Song ID column
      row.append("td").text(song.songID);
      row.append("td").text(song.songName);
      
      // Artist cell with clickable artist names for search refinement
      const artistCell = row.append("td");
      song.artist.split(",").map(s => s.trim()).forEach((artistName, i, arr) => {
        artistCell.append("span")
          .text(artistName)
          .style("cursor", "pointer")
          .style("text-decoration", "underline")
          .on("click", event => {
            event.stopPropagation();
            d3.select("#search-input").property("value", artistName);
            const matchingNode = this.state.globalNodes.find(n => n.id.toLowerCase() === artistName.toLowerCase());
            if (matchingNode) {
              this.state.userInteracted = true;
              this.highlightNeighbors(matchingNode);
            }
          });
        if (i < arr.length - 1) {
          artistCell.append("span").text(", ");
        }
      });
      
      row.append("td").text(song.releaseDate);
      if (this.currentYear === "all") {
        row.append("td").text(song.yearsOnChart);
      }
    });
  
    // Add pagination controls
    const pagination = detailsDiv.append("div")
      .attr("class", "pagination-controls")
      .style("margin-top", "10px");
    pagination.append("button")
      .text("Prev")
      .attr("disabled", tableState.currentPage <= 1 ? true : null)
      .on("click", () => {
        tableState.currentPage--;
        this.updateArtistDetailsTable(artist);
      });
    pagination.append("span")
      .style("margin", "0 10px")
      .text(`Page ${tableState.currentPage} of ${totalPages}`);
    pagination.append("button")
      .text("Next")
      .attr("disabled", tableState.currentPage >= totalPages ? true : null)
      .on("click", () => {
        tableState.currentPage++;
        this.updateArtistDetailsTable(artist);
      });
  }
  
  formatYearsOnChart(years) {
    if (!years) return "";
    if (Array.isArray(years)) return years.join(", ");
    try {
      const arr = JSON.parse(years);
      if (Array.isArray(arr)) return arr.join(", ");
    } catch (e) {}
    return years.trim();
  }

  updateTopKTable() {
    const topK = +d3.select("#topk-input").property("value");
    const sortedNodes = this.state.globalNodes.slice().sort((a, b) => b.totalStreams - a.totalStreams);
    const topKNodes = sortedNodes.slice(0, topK);
    if (!this.state.topKTable) {
      this.state.topKTable = { currentPage: 1, rowsPerPage: 10, sortKey: 'totalStreams', sortOrder: 'desc' };
    }
    const tableState = this.state.topKTable;
    topKNodes.sort((a, b) => {
      if (tableState.sortKey === 'name') {
        return tableState.sortOrder === 'asc' ? d3.ascending(a.id, b.id) : d3.descending(a.id, b.id);
      } else if (tableState.sortKey === 'totalStreams') {
        return tableState.sortOrder === 'asc' ? d3.ascending(a.totalStreams, b.totalStreams) : d3.descending(a.totalStreams, b.totalStreams);
      }
    });
    const totalPages = Math.ceil(topKNodes.length / tableState.rowsPerPage);
    tableState.currentPage = Math.max(1, Math.min(tableState.currentPage, totalPages));
    const startIndex = (tableState.currentPage - 1) * tableState.rowsPerPage;
    const pageData = topKNodes.slice(startIndex, startIndex + tableState.rowsPerPage);
    const panel = d3.select("#info-panel");
    panel.html("");
    panel.append("h3").text(`Top ${topK} Artists by Streams`);
    const table = panel.append("table").attr("class", "topk-table").style("width", "100%");
    const thead = table.append("thead");
    const tbody = table.append("tbody");
    const headerRow = thead.append("tr");
    headerRow.append("th")
      .text("Artist Name")
      .style("cursor", "pointer")
      .on("click", () => {
        tableState.sortKey === 'name'
          ? tableState.sortOrder = tableState.sortOrder === 'asc' ? 'desc' : 'asc'
          : (tableState.sortKey = 'name', tableState.sortOrder = 'asc');
        tableState.currentPage = 1;
        this.updateTopKTable();
      });
    headerRow.append("th")
      .text("Total Streams")
      .style("cursor", "pointer")
      .on("click", () => {
        tableState.sortKey === 'totalStreams'
          ? tableState.sortOrder = tableState.sortOrder === 'asc' ? 'desc' : 'asc'
          : (tableState.sortKey = 'totalStreams', tableState.sortOrder = 'desc');
        tableState.currentPage = 1;
        this.updateTopKTable();
      });
    pageData.forEach(node => {
      const row = tbody.append("tr")
        .style("cursor", "pointer")
        .on("click", () => {
          this.state.userInteracted = true;
          this.highlightNeighbors(node);
          d3.select("#search-input").property("value", node.id);
        });
      row.append("td").text(node.id);
      row.append("td").text(node.totalStreams);
    });
    const pagination = panel.append("div").attr("class", "pagination-controls").style("margin-top", "10px");
    pagination.append("button")
      .text("Prev")
      .attr("disabled", tableState.currentPage <= 1 ? true : null)
      .on("click", () => {
        tableState.currentPage--;
        this.updateTopKTable();
      });
    pagination.append("span")
      .style("margin", "0 10px")
      .text(`Page ${tableState.currentPage} of ${totalPages}`);
    pagination.append("button")
      .text("Next")
      .attr("disabled", tableState.currentPage >= totalPages ? true : null)
      .on("click", () => {
        tableState.currentPage++;
        this.updateTopKTable();
      });
  }

  /* =========================
     Filter & Zoom Methods
  ========================= */
  applyTopKFilter() {
    const topK = +d3.select("#topk-input").property("value");
    const sortedNodes = this.state.globalNodes.slice().sort((a, b) => b.totalStreams - a.totalStreams);
    const topKNodes = new Set(sortedNodes.slice(0, topK).map(n => n.id));
    this.state.overlayElements.style("opacity", d =>
      topKNodes.has(d.id) ? 1 : 0
    );
    this.updateTopKTable();
    if (this.state.selectedNode) {
      this.highlightNeighbors(this.state.selectedNode);
    }
  }

  // Removed reference to the old "minWeight" filter per updated requirements.
  applyFilterState() {
    this.state.nodeElements.style("opacity", 1);
    this.state.linkElements
      .style("opacity", 1)
      .attr("stroke", "#aaa");

    const sortedNodes = this.state.globalNodes.slice().sort((a, b) => b.totalStreams - a.totalStreams);
    const topK = +d3.select("#topk-input").property("value");
    const topKNodes = new Set(sortedNodes.slice(0, topK).map(n => n.id));
    this.state.overlayElements.style("opacity", d => topKNodes.has(d.id) ? 1 : 0);

    if (!this.state.selectedNode) { 
      this.updateTopKTable(); 
    }
    if (this.state.selectedNode) {
      this.highlightNeighbors(this.state.selectedNode);
    }
  }

  zoomToNodeAndNeighbors(selectedNode, connectedNodes) {
    const { svg, width, height, nodeElements } = this.state;
    const { xMin, xMax, yMin, yMax } = this.computeBoundingBox(nodeElements, d => connectedNodes.has(d.id));
    const networkWidth = xMax - xMin;
    const networkHeight = yMax - yMin;
    const centerX = (xMax + xMin) / 2;
    const centerY = (yMax + yMin) / 2;
    const circleRadius = Math.min(width, height) / 2;
    const networkSize = Math.max(networkWidth, networkHeight);
    const scale = (circleRadius * 0.5) / (networkSize / 2);
    svg.transition().duration(750).call(
      this.state.zoom.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-centerX, -centerY)
    );
  }

  computeBoundingBox(selection, filterFn = () => true) {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    selection.each(function(d) {
      if (filterFn(d)) {
        xMin = Math.min(xMin, d.x);
        xMax = Math.max(xMax, d.x);
        yMin = Math.min(yMin, d.y);
        yMax = Math.max(yMax, d.y);
      }
    });
    return { xMin, xMax, yMin, yMax };
  }

  fitGraphToSVG(final = false) {
    if (this.state.userInteracted) return;
    const { svg, width, nodeElements } = this.state;
    const { xMin, xMax, yMin, yMax } = this.computeBoundingBox(nodeElements);
    const networkWidth = xMax - xMin;
    const networkHeight = yMax - yMin;
    const centerX = (xMax + xMin) / 2;
    const centerY = (yMax + yMin) / 2;
    const circleRadius = Math.min(this.state.width, this.state.height) / 2;
    const networkSize = Math.max(networkWidth, networkHeight);
    const computedScale = circleRadius / (networkSize / 2);
    svg.transition().duration(final ? 1000 : 300).call(
      this.state.zoom.transform,
      d3.zoomIdentity.translate(this.state.width / 2, this.state.height / 2)
        .scale(computedScale)
        .translate(-centerX, -centerY)
    );
  }

  updateZoomExtentWithNetworkBounds(margin = 0) {
    const { xMin, xMax, yMin, yMax } = this.computeBoundingBox(this.state.nodeElements);
    const newExtent = [
      [xMin - margin, yMin - margin],
      [xMax + margin, yMax + margin]
    ];
    this.state.zoom.translateExtent(newExtent);
  }

  /* =========================
     History Navigation Methods
  ========================= */
  pushToHistory(artistNode) {
    const currentHistory = this.state.historyByYear[this.currentYear];
    if (!currentHistory) return;
    const { history, index } = currentHistory;
    const newArtistName = artistNode.id.toLowerCase();
    if (history[index] && history[index].id.toLowerCase() === newArtistName) {
      return;
    }
    let foundForwardIndex = -1;
    for (let i = index + 1; i < history.length; i++) {
      if (history[i].id.toLowerCase() === newArtistName) {
        foundForwardIndex = i;
        break;
      }
    }
    if (foundForwardIndex !== -1) {
      currentHistory.index = foundForwardIndex;
    } else {
      history.splice(index + 1, 0, artistNode);
      currentHistory.index = index + 1;
    }
    this.updateBackForwardButtons();
  }

  goBack() {
    const currentHistory = this.state.historyByYear[this.currentYear];
    if (currentHistory.index > 0) {
      currentHistory.index--;
      const artistNode = currentHistory.history[currentHistory.index];
      this.highlightNeighbors(artistNode);
      this.updateBackForwardButtons();
    }
  }

  goForward() {
    const currentHistory = this.state.historyByYear[this.currentYear];
    if (currentHistory.index < currentHistory.history.length - 1) {
      currentHistory.index++;
      const artistNode = currentHistory.history[currentHistory.index];
      this.highlightNeighbors(artistNode);
      this.updateBackForwardButtons();
    }
  }

  updateBackForwardButtons() {
    const currentHistory = this.state.historyByYear[this.currentYear];
    d3.select("#back-button").property("disabled", currentHistory.index <= 0);
    d3.select("#forward-button").property("disabled", currentHistory.index >= currentHistory.history.length - 1);
  }

  /* =========================
     UI Controls Setup
  ========================= */
  setupUIControls() {
    d3.selectAll(".year-button").on("click", event => {
      // Remove active styling from all buttons first
      d3.selectAll(".year-button").classed("active", false);
      // Then add active styling to the clicked button
      d3.select(event.target).classed("active", true);

      this.clearInfoPanel();
      const year = d3.select(event.target).attr("data-year");
      this.loadData(year);
    });

    // Set active class on the button that corresponds to the preloaded dataset
    const initialYear = this.options.initialYear || "2024";
    d3.select(`.year-button[data-year="${initialYear}"]`).classed("active", true);

    // Attach suggestions dropdown update on input event
    d3.select("#search-input").on("input", event => {
      const searchTerm = d3.select(event.target).property("value").trim();
      // Clear suggestions if search term is empty
      if (!searchTerm) {
        d3.select("#search-suggestions").html("");
        return;
      }
      
      // Build the filtered dataset (e.g., using your topK filter)
      const sortedNodes = this.state.globalNodes.slice().sort((a, b) => b.totalStreams - a.totalStreams);
      const topK = +d3.select("#topk-input").property("value");
      const filteredNodes = sortedNodes.slice(0, topK);
      
      // fuse.js instance config
      const fuseOptions = {
        keys: ['id'],
        threshold: 0.3
      };
      const fuse = new Fuse(this.state.globalNodes, fuseOptions);
      const results = fuse.search(searchTerm);
      
      // Get the top 5 suggestions
      const suggestions = results.slice(0, 5).map(result => result.item);
      
      // Update suggestions dropdown
      const suggestionsDiv = d3.select("#search-suggestions");
      suggestionsDiv.html("");
      suggestions.forEach(suggestion => {
        suggestionsDiv.append("div")
          .attr("class", "suggestion-item")
          .text(suggestion.id)
          .on("click", () => {
            // Auto-fill search input and trigger selection
            d3.select("#search-input").property("value", suggestion.id);
            suggestionsDiv.html("");
            this.state.userInteracted = true;
            this.highlightNeighbors(suggestion);
          });
      });
    });

    d3.select("#topk-input").on("input", () => this.applyTopKFilter());
  }
}

// Helper function to parse artist names from a CSV field
// It uses the known artist IDs to recombine parts if needed.
function parseArtistNames(artistString, knownArtistsSet) {
  const parts = artistString.split(",").map(s => s.trim());
  const names = [];
  for (let i = 0; i < parts.length; i++) {
    // If possible, combine with the next part and check if it is a known artist.
    if (i < parts.length - 1) {
      const combined = parts[i] + ", " + parts[i+1];
      if (knownArtistsSet.has(combined.toLowerCase())) {
        names.push(combined);
        i++; // Skip the next part since it was combined.
        continue;
      }
    }
    names.push(parts[i]);
  }
  return names;
}

document.addEventListener("click", (event) => {
  // We'll look up the suggestions div and search input
  const suggestionsDiv = document.getElementById("search-suggestions");
  const searchInput = document.getElementById("search-input");

  // If the click happened outside both the search input and the suggestions container, clear them
  if (
    suggestionsDiv &&
    searchInput &&
    !searchInput.contains(event.target) &&
    !suggestionsDiv.contains(event.target)
  ) {
    suggestionsDiv.innerHTML = "";
  }
});