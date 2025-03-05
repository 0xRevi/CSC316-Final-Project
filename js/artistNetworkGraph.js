const SPOTIFY_GREEN = "#1DB954";
const SELECTED_NODE_COLOR = "#ff4500";

class ArtistNetworkGraph {
    // TODO:
    /*
     * 1. Handle webpage skipping issues and duplicating loaded network graphs.
     * 2. More abstraction (currently hardcoded relative paths to datasets).
     * 3. Abstract styling logic to .css
     * 4. Debloat class ArtistNetworkGraph with smaller more focused classes (e.g. update table content).
     * 5. Optimize loading times by using pre-simulated ticks stored and loaded as .msgpack
     */
    constructor(container, options = {}) {
      this.container = container;
      this.options = options;
      this.currentYear = null;
      this.dataCache = {};

      // Global state for the graph
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
      };
    }
  
    // Initializes the graph by setting up the container, UI, and loading initial data.
    init() {
      const { svg, graphGroup, width, height } = this.createSVGContainer();
      this.state.svg = svg;
      this.state.graphGroup = graphGroup;
      this.state.width = width;
      this.state.height = height;
      this.state.zoom = this.setupZoom(svg, graphGroup, width, height);
      this.state.tooltip = this.createTooltip();
  
      // Disable fullPage scrolling when hovering the graph.
      this.container.on("mouseenter", () => {
        if (window.fullpage_api) fullpage_api.setAllowScrolling(false);
      }).on("mouseleave", () => {
        if (window.fullpage_api) fullpage_api.setAllowScrolling(true);
      });
      
  
      // Reset visualization when clicking on the background.
      svg.on("click", (event) => {
        if (event.target.tagName === "svg" || event.target.tagName === "rect") {
          this.resetVisualization();
        }
      });
  
      // Set up UI controls (buttons, search, slider events, etc.)
      this.setupUIControls();
  
      // Load initial data (use the option or default to "2024")
      const initialYear = this.options.initialYear || "2024";
      this.loadData(initialYear);
    }
  
    // -- SVG and Zoom Setup --
    createSVGContainer() {
      const size = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.6);
      const svg = this.container.append("svg")
        .attr("viewBox", `0 0 ${size} ${size}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("width", "100%")
        .style("height", "100%")
        .style("background-color", "transparent");
  
      svg.node().addEventListener("wheel", event => event.preventDefault(), { passive: false });
      svg.append("rect").attr("width", size).attr("height", size).attr("fill", "transparent");
      const graphGroup = svg.append("g")
        .attr("transform", `translate(${size / 2}, ${size / 2})`);
      return { svg, graphGroup, width: size, height: size };
    }
  
    setupZoom(svg, graphGroup, width, height) {
      const zoom = d3.zoom()
        .scaleExtent([0.1, 3])
        .translateExtent([[-Infinity, -Infinity], [Infinity, Infinity]])
        .constrain((transform, extent, translateExtent) => transform)
        .on("zoom", event => { graphGroup.attr("transform", event.transform); });
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
  
    // -
    loadData(year) {
      if (this.currentYear === year) {
        console.log("Year is already populated.");
        return;
      }
      this.currentYear = year;
      const startOverall = performance.now();
  
      if (this.dataCache[year]) {
        console.log(`Using cached data for year ${year}`);
        const { nodes, links, radiusScale, colorScale, songDataMap } = this.dataCache[year];
        this.finalizeDataLoad(nodes, links, radiusScale, colorScale, songDataMap, startOverall);
        return;
      }
  
      // Determine files to load
      const availableYears = ["2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"];
      const filesToLoad = (year === "all")
        ? availableYears.map(y => `data/artist_network/global-artist_network-${y}.csv`)
        : [`data/artist_network/global-artist_network-${year}.csv`];
  
      const networkPromise = Promise.all(filesToLoad.map(file => d3.dsv(",", file)));
      let songCSVPromise = (year === "all")
        ? d3.csv("data/chosic/chosic_all_time.csv")
        : d3.csv(`data/chosic/${year}-chosic.csv`);
  
      Promise.all([networkPromise, songCSVPromise])
        .then(([datasets, csvRows]) => {
          const { nodes, links, radiusScale, colorScale } = this.processData(datasets);
  
          // Build songDataMap
          const songDataMap = {};
          csvRows.forEach(row => {
            const key = row.spotify_track_id || row.song_id;
            const streams = row.yearly_streams ? +row.yearly_streams :
                            (row.all_time_streams ? +row.all_time_streams : 0);
            songDataMap[key] = {
              spotify_track_id: row.spotify_track_id,
              song: row.song,
              artist: row.artist,
              popularity: row.popularity,
              bpm: row.bpm,
              genres: row.genres,
              parent_genres: row.parent_genres,
              album: row.album,
              album_date: row.album_date,
              time: row.time,
              dance: row.dance,
              energy: row.energy,
              acoustic: row.acoustic,
              instrumental: row.instrumental,
              happy: row.happy,
              speech: row.speech,
              live: row.live,
              loud: row["loud_(db)"],
              key: row.key,
              time_signature: row.time_signature,
              album_label: row.album_label,
              camelot: row.camelot,
              isrc: row.isrc,
              streams: streams,
              release_date: row.release_date,
              release_date_precision: row.release_date_precision,
              album_type: row.album_type,
              years_on_chart: row.years_on_chart
            };
          });
  
          this.dataCache[year] = { nodes, links, radiusScale, colorScale, songDataMap };
          this.finalizeDataLoad(nodes, links, radiusScale, colorScale, songDataMap, startOverall);
        })
        .catch(error => { console.error("Error loading data:", error); });
    }
  
    finalizeDataLoad(nodes, links, radiusScale, colorScale, songDataMap, startOverall) {
      this.state.globalLinks = links;
      this.state.globalNodes = nodes;
      this.state.globalColorScale = colorScale;
      this.state.songDataMap = songDataMap;
  
      // Compute cumulative streams for each node
      nodes.forEach(node => {
        let totalStreams = 0;
        if (node.song_ids && node.song_ids.length > 0) {
          node.song_ids.forEach(songID => {
            const songData = songDataMap[songID];
            if (songData && songData.streams) totalStreams += songData.streams;
          });
        }
        node.totalStreams = totalStreams;
      });
  
      // Update slider UI based on data
      const maxCollaborators = d3.max(nodes, d => d.degree);
      d3.select("#weight-slider").attr("max", maxCollaborators).property("value", 1);
      d3.select("#weight-value").text(1);
  
      this.state.graphGroup.selectAll("*").remove();
      this.createGraph(nodes, links, radiusScale, colorScale);
      console.log(`Total render time for ${this.currentYear}: ${performance.now() - startOverall} ms`);
    }
  
    processData(datasets) {
      let allLinks = [];
      datasets.forEach(data => {
        data.forEach(d => {
          let songs;
          try {
            songs = JSON.parse(d.song_ids.replace(/'/g, '"'));
          } catch (e) { songs = []; }
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
        d.song_ids = []; // to be filled next
      });
      allLinks.forEach(link => {
        link.songIDs.forEach(songID => {
          const sourceNode = nodes.find(n => n.id === link.source);
          const targetNode = nodes.find(n => n.id === link.target);
          if (sourceNode && !sourceNode.song_ids.includes(songID)) sourceNode.song_ids.push(songID);
          if (targetNode && !targetNode.song_ids.includes(songID)) targetNode.song_ids.push(songID);
        });
      });
      const degreeExtent = d3.extent(nodes, d => d.degree);
      const radiusScale = d3.scaleLinear().domain(degreeExtent).range([8, 20]);
      const colorScale = d3.scaleSequential(d3.interpolateViridis).domain(degreeExtent);
      return { nodes, links: allLinks, radiusScale, colorScale };
    }
  
    // -- Graph Rendering and Interaction --
    createGraph(nodes, links, radiusScale, colorScale) {
      const { width, graphGroup, tooltip, svg } = this.state;
      const maxLinkValue = d3.max(links, d => d.linkValue);
      const strokeScale = d3.scaleLinear().domain([0, maxLinkValue]).range([1, 5]).clamp(true);
      this.state.userInteracted = false;
      const hasPrecomputedPositions = nodes.length > 0 && nodes[0].x !== undefined;
      if (!hasPrecomputedPositions) {
        const simulation = d3.forceSimulation(nodes)
          .force("link", d3.forceLink(links).id(d => d.id).strength(d => d.linkValue * 0.1))
          .force("radial", d3.forceRadial(Math.min(width, this.state.height) / 4, width / 2, this.state.height / 2).strength(0.3))
          .force("charge", d3.forceManyBody().strength(-100))
          .force("center", d3.forceCenter(width / 2, this.state.height / 2))
          .force("x", d3.forceX(width / 2).strength(0.05))
          .force("y", d3.forceY(this.state.height / 2).strength(0.05))
          .alphaDecay(0.08)
          .alphaMin(0.02);
        simulation.stop();
        for (let i = 0; i < 200; i++) simulation.tick();
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
      this.state.linkElements.transition().duration(800).style("opacity", 1);
  
      this.state.nodeElements = graphGroup.append("g")
        .selectAll("circle")
        .data(nodes)
        .enter().append("circle")
        .attr("r", d => radiusScale(d.degree))
        .style("fill", d => colorScale(d.degree))
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .style("opacity", 0)
        .call(d3.drag()
          .on("start", (event, d) => this.dragStarted(event, d))
          .on("drag", (event, d) => this.dragged(event, d))
          .on("end", (event, d) => this.dragEnded(event, d))
        )
        .on("mouseover", (event, d) => {
          tooltip.transition().duration(200).style("opacity", 0.9);
          tooltip.html(`<strong>${d.id}</strong><br/>Collaborators: ${d.degree}<br/>Songs: ${d.songCount || 0}`)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", () => { tooltip.transition().duration(500).style("opacity", 0); })
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
  
      this.state.labelElements = graphGroup.append("g")
        .selectAll("text")
        .data(nodes)
        .enter().append("text")
        .attr("dx", d => radiusScale(d.degree) + 4)
        .attr("dy", 4)
        .text(d => d.id)
        .style("font-size", "10px")
        .style("pointer-events", "none")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .style("fill", "white")
        .style("opacity", 0);
      this.state.labelElements.transition().duration(800).style("opacity", 1);
  
    this.state.labelElements
      .transition()
      .duration(800)
      .style("opacity", 1);

      this.fitGraphToSVG(true);
      this.updateZoomExtentWithNetworkBounds(50);
    }
  
    // -- Drag Event Handlers --
    dragStarted(event, d) {
      if (!event.active) d3.select(event.sourceEvent.target).raise();
      d.fx = d.x; d.fy = d.y;
    }
    dragged(event, d) { d.fx = event.x; d.fy = event.y; }
    dragEnded(event, d) { 
      if (!event.active) d3.select(event.sourceEvent.target);
      d.fx = null; d.fy = null;
    }
  
    // -- Node Highlighting and Info Panel --
    highlightNeighbors(selected) {
      this.state.selectedNode = selected;
      
      // Find neighbors
      const connectedNodes = new Set([selected.id]);
      this.state.globalLinks.forEach(link => {
        const sourceID = typeof link.source === "object" ? link.source.id : link.source;
        const targetID = typeof link.target === "object" ? link.target.id : link.target;
        if (sourceID === selected.id || targetID === selected.id) {
          connectedNodes.add(sourceID);
          connectedNodes.add(targetID);
        }
      });
    
      // Highlight edges in the selected node’s network
      this.state.linkElements
        .style("opacity", d => {
          const sourceID = typeof d.source === "object" ? d.source.id : d.source;
          const targetID = typeof d.target === "object" ? d.target.id : d.target;
          return (connectedNodes.has(sourceID) && connectedNodes.has(targetID)) ? 1 : 0.1;
        })
        .attr("stroke", d => {
          const sourceID = typeof d.source === "object" ? d.source.id : d.source;
          const targetID = typeof d.target === "object" ? d.target.id : d.target;
          return (connectedNodes.has(sourceID) && connectedNodes.has(targetID))
            ? "#1db954"  // Spotify green highlight
            : "#aaa";
        });
    
      // Highlight connected nodes; fade out others
      this.state.nodeElements
        .style("opacity", d => connectedNodes.has(d.id) ? 1 : 0.1)
        .style("fill", d => {
          if (d.id === selected.id) {
            return "#ff4500"; // distinct color for the clicked node
          } else if (connectedNodes.has(d.id)) {
            return "#1db954"; // Spotify green for neighbors
          } else {
            // Whatever the filter or normal color would have been is overridden if it's not in the set
            return this.state.globalColorScale(d.degree);
          }
        });
    
      // Labels: show fully if in the set, fade otherwise
      this.state.labelElements
        .style("opacity", d => connectedNodes.has(d.id) ? 1 : 0.1)
        .style("fill", "#fff");
    
      // Update info panel
      this.updateInfoPanel(selected, [...connectedNodes].filter(id => id !== selected.id));
    
      // Zoom to focus
      this.zoomToNodeAndNeighbors(selected, connectedNodes);
    }

    resetVisualization() {
      // Clear the selected node
      this.state.selectedNode = null;
    
      // Clear highlight
      this.state.nodeElements
        .style("opacity", 1)
        .style("fill", d => this.state.globalColorScale(d.degree));
    
      this.state.linkElements
        .style("opacity", 1)
        .attr("stroke", "#aaa");
    
      this.state.labelElements
        .style("opacity", 1)
        .style("fill", "#fff");
    
      this.clearInfoPanel();
    
      // Now apply the filter logic without highlight override
      this.applyFilterState();
    }
    
    updateInfoPanel(artist, collaboratorIDs) {
      const panel = d3.select("#info-panel");
      panel.html("");
      panel.append("h3").text("Artist Information");
      panel.append("p").html(`<strong>Name:</strong> ${artist.id}`);
  
      const collabPara = panel.append("p");
      collabPara.append("strong").text(`Collaborators (${collaboratorIDs.length}): `);
      collaboratorIDs.forEach((collab, i) => {
        collabPara.append("span")
          .text(collab)
          .style("cursor", "pointer")
          .style("text-decoration", "underline")
          .on("click", (event) => {
            event.stopPropagation();
            d3.select("#search-input").property("value", collab);
            const matchingNode = this.state.globalNodes.find(n => n.id.toLowerCase() === collab.toLowerCase());
            if (matchingNode) {
              this.state.userInteracted = true;
              this.highlightNeighbors(matchingNode);
            }
          });
        if (i < collaboratorIDs.length - 1) collabPara.append("span").text(", ");
      });
      panel.append("p").html(`<strong>Songs:</strong> ${artist.songCount || 0}`);
      if (artist.song_ids && artist.song_ids.length > 0) {
        this.updateArtistDetailsTable(artist);
      }
    }
  
    clearInfoPanel() {
      d3.select("#info-panel").html("");
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
  
    // -- Detailed Song Info and Top-K Tables --
    updateArtistDetailsTable(artist) {
      let songs = [];
      if (artist.song_ids && artist.song_ids.length > 0) {
        artist.song_ids.forEach(songID => {
          const songData = this.state.songDataMap[songID];
          if (songData) {
            if (this.currentYear === "all") {
              songs.push({
                spotifyTrackID: songData.spotify_track_id,
                songName: songData.song,
                artist: songData.artist,
                releaseDate: songData.release_date,
                streams: songData.streams,
                album: songData.album,
                albumDate: songData.album_date,
                albumType: songData.album_type,
                yearsOnChart: this.formatYearsOnChart(songData.years_on_chart)
              });
            } else {
              songs.push({
                spotifyTrackID: songData.spotify_track_id,
                songName: songData.song,
                artist: songData.artist,
                releaseDate: songData.release_date,
                streams: songData.streams,
                album: songData.album,
                albumDate: songData.album_date,
                albumType: songData.album_type
              });
            }
          }
        });
      }
  
      if (!this.state.artistTable) {
        this.state.artistTable = {
          currentPage: 1,
          rowsPerPage: 10,
          sortKey: 'streams',
          sortOrder: 'desc'
        };
      }
      let tableState = this.state.artistTable;
  
      songs.sort((a, b) => {
        if (tableState.sortKey === 'songName') {
          return tableState.sortOrder === 'asc' ? d3.ascending(a.songName, b.songName) : d3.descending(a.songName, b.songName);
        } else if (tableState.sortKey === 'releaseDate') {
          return tableState.sortOrder === 'asc' ? d3.ascending(a.releaseDate, b.releaseDate) : d3.descending(a.releaseDate, b.releaseDate);
        } else if (tableState.sortKey === 'streams') {
          return tableState.sortOrder === 'asc' ? d3.ascending(a.streams, b.streams) : d3.descending(a.streams, b.streams);
        } else if (tableState.sortKey === 'artist') {
          return tableState.sortOrder === 'asc' ? d3.ascending(a.artist, b.artist) : d3.descending(a.artist, b.artist);
        } else if (tableState.sortKey === 'album') {
          return tableState.sortOrder === 'asc' ? d3.ascending(a.album, b.album) : d3.descending(a.album, b.album);
        } else if (tableState.sortKey === 'albumDate') {
          return tableState.sortOrder === 'asc' ? d3.ascending(a.albumDate, b.albumDate) : d3.descending(a.albumDate, b.albumDate);
        } else if (tableState.sortKey === 'albumType') {
          return tableState.sortOrder === 'asc' ? d3.ascending(a.albumType, b.albumType) : d3.descending(a.albumType, b.albumType);
        }
      });
  
      const totalPages = Math.ceil(songs.length / tableState.rowsPerPage);
      if (tableState.currentPage > totalPages) tableState.currentPage = totalPages;
      if (tableState.currentPage < 1) tableState.currentPage = 1;
      const startIndex = (tableState.currentPage - 1) * tableState.rowsPerPage;
      const pageData = songs.slice(startIndex, startIndex + tableState.rowsPerPage);
  
      d3.select("#info-panel").select(".artist-details").remove();
      const detailsDiv = d3.select("#info-panel").append("div").attr("class", "artist-details");
      detailsDiv.append("h4").text(`Song Details for ${artist.id}`);
  
      const table = detailsDiv.append("table")
        .attr("class", "artist-details-table")
        .style("width", "100%");
      const thead = table.append("thead");
      const tbody = table.append("tbody");
  

      const headers = [
        { label: "Spotify Track ID", sortKey: null },
        { label: "Song Name", sortKey: "songName", defaultSortOrder: "asc" },
        { label: "Artist", sortKey: "artist", defaultSortOrder: "asc" },
        { label: "Release Date", sortKey: "releaseDate", defaultSortOrder: "asc" },
        { label: "Streams", sortKey: "streams", defaultSortOrder: "desc" },
        { label: "Album", sortKey: "album", defaultSortOrder: "asc" },
        { label: "Album Date", sortKey: "albumDate", defaultSortOrder: "asc" },
        { label: "Album Type", sortKey: "albumType", defaultSortOrder: "asc" }
      ];
      
      if (this.currentYear === "all") {
        headers.push({ label: "Years on Chart", sortKey: null });
      }
      
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
      if (this.currentYear === "all") {
        headerRow.append("th").text("Years on Chart").style("cursor", "default");
      }
  
      pageData.forEach(song => {
        const row = tbody.append("tr");
        row.append("td").text(song.spotifyTrackID);
        row.append("td").text(song.songName);
        const artistCell = row.append("td");
        song.artist.split(",").map(s => s.trim()).forEach((artist, i) => {
          artistCell.append("span")
            .text(artist)
            .style("cursor", "pointer")
            .style("text-decoration", "underline")
            .on("click", (event) => {
              event.stopPropagation();
              d3.select("#search-input").property("value", artist);
              const matchingNode = this.state.globalNodes.find(n => n.id.toLowerCase() === artist.toLowerCase());
              if (matchingNode) {
                this.state.userInteracted = true;
                this.highlightNeighbors(matchingNode);
              }
            });
          if (i < song.artist.split(",").length - 1) {
            artistCell.append("span").text(", ");
          }
        });
        const songFeatures = [song.releaseDate, song.streams, song.album, song.albumDate, song.albumType];

        songFeatures.forEach(feature => {
          row.append("td").text(feature);
        })

        if (this.currentYear === "all") row.append("td").text(song.yearsOnChart);
      });

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
      if (tableState.currentPage > totalPages) tableState.currentPage = totalPages;
      if (tableState.currentPage < 1) tableState.currentPage = 1;
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


    applyCollaborationFilter() {
      const minWeight = +d3.select("#weight-slider").property("value");
      d3.select("#weight-value").text(minWeight);
    
      // Fade out nodes below the threshold
      this.state.nodeElements.style("opacity", d =>
        d.degree >= minWeight ? 1 : 0.3
      );
    
      // Fade out edges if either endpoint is below threshold
      const visibleNodes = new Set(
        this.state.globalNodes.filter(d => d.degree >= minWeight).map(d => d.id)
      );
      this.state.linkElements
        .style("opacity", d => {
          const s = typeof d.source === "object" ? d.source.id : d.source;
          const t = typeof d.target === "object" ? d.target.id : d.target;
          return (visibleNodes.has(s) && visibleNodes.has(t)) ? 1 : 0.1;
        })
        .attr("stroke", "#aaa");
    
      // If there's a node currently selected (focus mode), re‐highlight it so it "wins" over the filter styling
      if (this.state.selectedNode) {
        this.highlightNeighbors(this.state.selectedNode);
      }
    }
    

    applyTopKFilter() {
      const topK = +d3.select("#topk-input").property("value");
    
      // Sort nodes by totalStreams
      const sortedNodes = this.state.globalNodes.slice()
        .sort((a, b) => b.totalStreams - a.totalStreams);
    
      // Take the top K
      const topKNodes = new Set(sortedNodes.slice(0, topK).map(n => n.id));
    
      // Show halos for the top K nodes, hide for others
      this.state.overlayElements.style("opacity", d =>
        topKNodes.has(d.id) ? 1 : 0
      );
    
      // Update the top K table or info panel if you want
      this.updateTopKTable();
    
      // If a node is still selected, re‐highlight it
      if (this.state.selectedNode) {
        this.highlightNeighbors(this.state.selectedNode);
      }
    }
  

    applyFilterState() {
      const minWeight = +d3.select("#weight-slider").property("value");
      d3.select("#weight-value").text(minWeight);
  
      this.state.nodeElements.style("opacity", d => (d.degree >= minWeight) ? 1 : 0.3);
      this.state.labelElements.style("opacity", d => (d.degree >= minWeight) ? 1 : 0.3);
  
      const visibleNodes = new Set(
        this.state.globalNodes.filter(d => d.degree >= minWeight).map(d => d.id)
      );
  
      this.state.linkElements
        .style("opacity", d => {
          const sourceID = typeof d.source === "object" ? d.source.id : d.source;
          const targetID = typeof d.target === "object" ? d.target.id : d.target;
          return (visibleNodes.has(sourceID) && visibleNodes.has(targetID)) ? 1 : 0.1;
        })
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

    //! CONTROL SETUP
    setupUIControls() {
      d3.selectAll(".year-button").on("click", (event) => {
        this.clearInfoPanel();
        const year = d3.select(event.target).attr("data-year");
        this.loadData(year);
      });
      d3.select("#search-input").on("keydown", (event) => {
        if (event.key === "Enter") {
          const searchTerm = d3.select(event.target).property("value").trim().toLowerCase();
          if (!this.state.globalNodes || this.state.globalNodes.length === 0) {
            alert("Data not loaded yet!");
            return;
          }
          const matchingNode = this.state.globalNodes.find(d => d.id.toLowerCase() === searchTerm);
          if (matchingNode) {
            this.state.userInteracted = true;
            this.highlightNeighbors(matchingNode);
          } else {
            alert("Artist not found!");
          }
        }
      });

      // Collaboration slider
      d3.select("#weight-slider").on("input", () => {
        this.applyCollaborationFilter();
      });

      // Top K input
      d3.select("#topk-input").on("input", () => {
        this.applyTopKFilter();
      });

    }
  
    //! HELPER FUNCTIONS
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
  }
  