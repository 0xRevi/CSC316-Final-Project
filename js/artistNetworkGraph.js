const SPOTIFY_GREEN = "#1DB954";
const SELECTED_NODE_COLOR = "#ff4500";

class ArtistNetworkGraph {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.currentYear = null;
    this.dataCache = {};

    // Artist images for mapping
    this.artistImagesMapping = {};

    this.currentArtist = null;         // Currently selected artist
    this.instructionsDismissed = false;  // Whether the user has dismissed the instructions
    this.isInstructionView = false;      // Whether the instructions panel is currently open
    
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


  hideInfo() {
    d3.select("#overlay").style("display", "none");
    d3.select("#info-panel").style("display", "none");
  }
  showInfo() {
    d3.select("#overlay").style("display", "block");
    d3.select("#info-panel").style("display", "block");
  }
  
  init() {
    const { svg, graphGroup, width, height } = this.createSVGContainer();
    Object.assign(this.state, { svg, graphGroup, width, height });
    this.state.zoom = this.setupZoom(svg, graphGroup);
    this.state.tooltip = this.createTooltip();

    this.disableFullPageScrolling();
    this.setupUIControls();
    this.showInstructionPanel();
    this.bindSVGBackgroundClick();
    this.loadArtistImages();

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
  createSVGContainer() {
    // Use user-based dimensions to auto-configure display dimensions
    // Get the title element and the network container
    const titleEl = document.getElementById("top-panel-wrapper");
    const networkContainer = document.getElementById("artist-network-container");

    // Get the title height (in pixels)
    const titleHeight = titleEl.offsetHeight;

    // Calculate available height (viewport height minus title height)
    const availableHeight = window.innerHeight - titleHeight;

    // Set the network container's height dynamically
    networkContainer.style.height = `${availableHeight}px`;

    const containerWidth = networkContainer.clientWidth;
    const containerHeight = networkContainer.clientHeight;
    
    const svg = d3.select(networkContainer)
      .append("svg")
      .attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("width", "100%")
      .style("height", "100%")
      .style("background-color", "transparent");

    svg.node().addEventListener("wheel", event => event.preventDefault(), { passive: false });
    svg.append("rect")
      .attr("width", containerWidth)
      .attr("height", containerHeight)
      .attr("fill", "transparent");
    const graphGroup = svg.append("g")
      .attr("transform", `translate(${containerWidth / 2}, ${containerHeight / 2})`);
    return { svg, graphGroup, width: containerWidth, height: containerHeight };
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
  }

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
            song_name: row.song_name,
            artist_names: row.artist_names,
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
    this.state.globalNodes.forEach(node => {
      nodes.forEach(node => {
        node.totalStreams = (node.song_ids || []).reduce((sum, songID) => {
          const songData = songDataMap[songID];
          return sum + (songData && songData.streams ? songData.streams : 0);
        }, 0);
      })
    });

    // Precompute ranking
    const sortedByStreams = this.state.globalNodes.slice().sort((a, b) => b.totalStreams - a.totalStreams);
    sortedByStreams.forEach((node, index) => {
      node.rank = index + 1;
    });

    // Clear previous graph and create new graph
    this.state.graphGroup.selectAll("*").remove();
    this.createGraph(nodes, links, radiusScale, colorScale);
    console.log(`Total render time for ${this.currentYear}: ${performance.now() - startOverall} ms`);
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

  loadArtistImages() {
    d3.csv("img/artist_network/artist_images.csv").then(data => {
      // Build a mapping with keys as lowercased artist_id and artist_name.
      data.forEach(d => {
        if (d.artist_id && d.image_url) {
          this.artistImagesMapping[d.artist_id.toLowerCase()] = d.image_url;
        }
        if (d.artist_name && d.image_url) {
          this.artistImagesMapping[d.artist_name.toLowerCase()] = d.image_url;
        }
      });
      console.log("Artist images mapping loaded:", this.artistImagesMapping);
    }).catch(error => {
      console.error("Error loading artist images:", error);
    });
  }

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
        tooltip.html(`<strong>${d.id}</strong><br/>Rank: #${d.rank}<br/>Collaborators: ${d.degree}<br/>Songs: ${d.songCount || 0}`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", () => tooltip.transition().duration(200).style("opacity", 0))
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
      // TODO: See why this is needed to display nodes
      .style("fill", "none")
      .style("stroke", "gold")
      .style("stroke-width", "2px")
      .style("opacity", 0);

    // Save radiusScale for later use
    this.state.radiusScale = radiusScale;

    this.fitGraphToSVG(true);
    this.updateZoomExtentWithNetworkBounds(500);
  }

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
    this.currentArtist = null;
  
    this.state.nodeElements
      .style("opacity", 1)
      .style("fill", d => this.state.globalColorScale(d.degree));
  
    this.state.linkElements
      .style("opacity", 0)
      .style("pointer-events", "none")
      .attr("stroke", "#aaa");
  
    this.state.graphGroup.select(".dynamic-labels").remove();
    this.clearInfoPanel();
  
    // Reset the toggle icon to show instructions mode.
    this.isInstructionView = false;
    this.showInstructionToggleIcon();
  }
  


  //! Instruction Panel
  showInstructionPanel() {
    this.isInstructionView = true;
    const panel = d3.select("#info-panel")
      .classed("instruction-view", true)
      .classed("artist-view", false)
      .style("display", "block")
      .attr("tabindex", "0")
      .on("mouseenter", function () { this.focus(); })
      .on("wheel", function (event) { event.stopPropagation(); });
  
    panel.html("");
  
    const instructionWrapper = panel.append("div")
    .attr("class", "instruction-content")
    // Build the instruction content.
    const instructionContent = instructionWrapper.append("div")
      .attr("class", "instruction-body")

    instructionContent.append("h2")
      .text("Welcome to the Artist Network")

    instructionContent.append("p")
      .html("Click on a node to see artist details or search artists by name.<br>" +
            "To minimize this pane, click the button in the corner.");

    panel.append("button")
      .attr("id", "instruction-minimize-btn")
      .classed("nav-button minimize-button", true)
      .html('<i class="fa-solid fa-minus"></i>')
      .on("click", () => this.minimizeInfo());

    // Always ensure the toggle icon is present.
    this.showInstructionToggleIcon();
  }


  showInstructionToggleIcon() {
    let toggleIcon = d3.select("#instruction-toggle-icon");
    const panelHidden = d3.select("#info-panel").style("display") === "none";
  
    // Determine if the NEXT click should open the artist pane
    const nextIsArtist = this.currentArtist && panelHidden;
  
    // Set border‑color class
    toggleIcon
      .classed("artist-mode", nextIsArtist)
      .classed("instructions-mode", !nextIsArtist);

    //! WHAT WE HAD BEFORE BELOW
    if (toggleIcon.empty()) {
      toggleIcon = d3.select("#artist-network-container")
        .append("div")
        .attr("id", "instruction-toggle-icon")
        .classed("instruction-toggle-icon", true);
    }
    
    // Check if the info panel is currently visible.
    const panelDisplay = d3.select("#info-panel").style("display");
    
    if (!this.currentArtist) {
      // No artist selected, only instructions are available.
      // Style the button to show instructions-mode (green).
      toggleIcon.classed("artist-mode", false)
                .classed("instructions-mode", true)
                .html('<i class="fa fa-info" aria-hidden="true"></i>');
    } else {
      // An artist is selected.
      if (panelDisplay === "none") {
        const key = this.currentArtist.id.toLowerCase();
        const imgUrl = this.artistImagesMapping[key] || "img/artist_network/default_artist.png";
        toggleIcon
          .classed("instructions-mode", false)
          .classed("artist-mode", true)
          .html(`<img src="${imgUrl}" alt="${this.currentArtist.id}" />`);
      } else {
        // The panel is visible.
        if (this.isInstructionView) {
          const key = this.currentArtist.id.toLowerCase();
          const imgUrl = this.artistImagesMapping[key] || "img/artist_network/default_artist.png";
          toggleIcon
            .classed("instructions-mode", false)
            .classed("artist-mode", true)
            .html(`<img src="${imgUrl}" alt="${this.currentArtist.id}" />`);
        } else {
          // Artist pane is visible: next click will show instructions.
          // So style the icon to instructions-mode (green).
          toggleIcon.classed("artist-mode", false)
                    .classed("instructions-mode", true)
                    .html('<i class="fa fa-info" aria-hidden="true"></i>');
        }
      }
    }
    
    // Bind the click event to toggle the view appropriately.
    toggleIcon.on("click", () => {
      const panelDisplay = d3.select("#info-panel").style("display");
      if (!this.currentArtist) {
        // When no artist is selected, toggle the instructions pane only.
        if (panelDisplay === "none") {
          this.showInstructionPanel();
        } else {
          d3.select("#info-panel").style("display", "none");
        }
      } else {
        // When an artist is selected, toggle between artist info and instructions.
        if (panelDisplay === "none") {
          // If the panel is hidden, default to showing the artist info.
          this.updateInfoPanel(this.currentArtist);
        } else {
          if (this.isInstructionView) {
            // If currently showing instructions, switch to artist info.
            this.updateInfoPanel(this.currentArtist);
          } else {
            // If currently showing artist info, switch to instructions.
            this.showInstructionPanel();
          }
        }
      }
      // Update the toggle icon appearance after the action.
      this.showInstructionToggleIcon();
    });
  }

  updateInfoPanel(artist, collaboratorIDs) {
    this.currentArtist = artist;
    this.isInstructionView = false;
    this.instructionsDismissed = true;
  
    const panel = d3.select("#info-panel")
      .classed("instruction-view", true)
      .classed("artist-view", false)
      .style("display", "block")
      .attr("tabindex", "0")
      .on("mouseenter", function() { this.focus(); })
      .on("wheel", event => event.stopPropagation());
  
    panel.html("");
    panel.node().scrollTop = 0;
  
    // Remove any existing nav buttons
    d3.select("#back-button")?.remove();
    d3.select("#forward-button")?.remove();
  
    // Top‑left navigation buttons
    panel.append("button")
      .attr("id", "back-button")
      .classed("nav-button", true)
      .html('<i class="fa-solid fa-arrow-left"></i>')
      .on("click", () => this.goBack());
  
    panel.append("button")
      .attr("id", "forward-button")
      .classed("nav-button", true)
      .html('<i class="fa-solid fa-arrow-right"></i>')
      .on("click", () => this.goForward());
  
    this.updateBackForwardButtons();
    // TODO Abstract styling for card, header, left section, text container, hr to css,
    // Card Container
    const card = panel.append("div")
      .attr("class", "artist-card")
      .style("background-color", "#212121")
      .style("border", "1px solid #333")
      .style("border-radius", "8px")
      .style("padding", "16px")
      .style("margin-top", "36px")
      .style("margin-bottom", "20px")
      .style("font-family", "'Montserrat', sans-serif");
  
    // Header
    const header = card.append("div")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "space-between")
      .style("margin-bottom", "16px");
  
    const leftSection = header.append("div")
      .style("display", "flex")
      .style("align-items", "center");
  
    let imageUrl = "img/artist_network/default_artist.png";
    const key = artist.id.toLowerCase();
    if (this.artistImagesMapping[key]) imageUrl = this.artistImagesMapping[key];
  
    leftSection.append("img")
      .attr("src", imageUrl)
      .style("width", "80px")
      .style("height", "80px")
      .style("border-radius", "50%")
      .style("object-fit", "cover")
      .style("margin-right", "16px")
      .style("border", "2px solid #fff");
  
    const textContainer = leftSection.append("div");
    textContainer.append("h2")
      .text(artist.id)
      .style("margin", "0")
      .style("color", "#fff")
      .style("font-size", "24px");
  
    const sortedByStreams = this.state.globalNodes.slice().sort((a, b) => b.totalStreams - a.totalStreams);
    const artistRank = sortedByStreams.findIndex(n => n.id === artist.id) + 1;

    textContainer.append("p")
      .text(`Rank by total streams: #${artistRank}`)
      .style("margin", "4px 0 0 0")
      .style("color", "#ccc")
      .style("font-size", "14px");

    // If viewing “all” years, list chart‑years in the artist card
    if (this.currentYear === "all") {
      const allYears = artist.song_ids.flatMap(id => {
        const raw = this.state.songDataMap[id]?.years_on_chart;
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return raw.split(",").map(y => y.trim());
        }
      });
    
      // Dedupe + normalize to string + sort numerically
      const uniqueSorted = Array.from(new Set(allYears.map(String)))
        .map(Number)
        .sort((a, b) => a - b)
        .map(String);
    
      textContainer.append("p")
        .text(`Years on Chart: ${uniqueSorted.join(", ")}`)
        .style("margin", "4px 0 0 0")
        .style("color", "#ccc")
        .style("font-size", "11px"); // 11px makes it so that 2017-2024 fits on a line
    }
    
  
    // Meta Info
    const metaSection = card.append("div").style("margin-bottom", "16px");
    metaSection.append("p").text(`Collaborators: ${artist.degree}`).style("color", "#fff");
    metaSection.append("p").text(`Song Count: ${artist.song_ids?.length || 0}`).style("color", "#fff");
  
    card.append("hr")
      .style("border-top", "1px solid #444")
      .style("margin", "16px 0");
  
    this.updateArtistDetailsTable(artist);

    // Minimize (–)
    panel.append("button")
      .attr("id", "info-panel-minimize-btn")
      .classed("nav-button minimize-button", true)
      .html('<i class="fa-solid fa-minus"></i>')
      .on("click", () => this.minimizeInfo());
  

    // Close (✕)
    panel.append("button")
      .attr("id", "info-panel-close-btn")
      .classed("nav-button minimize-button", true)
      .html('<i class="fa-solid fa-xmark"></i>')
      .on("click", () => this.resetVisualization());



  
    this.showInstructionToggleIcon();
  }
  

  clearInfoPanel() {
    d3.select("#info-panel")
      .html("")
      .style("display", "none");
  }

  updateArtistDetailsTable(artist) {
    // Get all songs from the dataset.
    const allSongs = Object.values(this.state.songDataMap);
    
    // Filter songs to include those where the selected artist appears in the artist_names field.
    const songs = allSongs.filter(songData => {
      if (!songData.artist_names) return false;
      const artistNames = songData.artist_names.split(",").map(a => a.trim().toLowerCase());
      return artistNames.includes(artist.id.toLowerCase());
    }).map(songData => {
      if (this.currentYear === "all") {
        return {
          songName: songData.song_name,
          artist: songData.artist_names,
          releaseDate: songData.release_date,
          //yearsOnChart: this.formatYearsOnChart(songData.years_on_chart)
        };
      } else {
        return {
          songName: songData.song_name,
          artist: songData.artist_names,
          releaseDate: songData.release_date
        };
      }
    });
    
    // Clear any existing details and create a new details container.
    d3.select("#info-panel").select(".artist-details").remove();
    const detailsDiv = d3.select("#info-panel").append("div").attr("class", "artist-details");
    detailsDiv.append("h4").text("Songs in the Top 200");
    
    // Build the table.
    const table = detailsDiv.append("table").attr("class", "artist-details-table");
    const thead = table.append("thead");
    const tbody = table.append("tbody");
    
    // Define headers. (Only song name and release date are sortable.)
    const headers = [
      { label: "Song Name", sortKey: "songName" },
      { label: "Artist", sortKey: null },
      { label: "Release Date", sortKey: "releaseDate" }
    ];
    if (this.currentYear === "all") {
      //headers.push({ label: "Years on Chart", sortKey: null });
    }
    
    // Maintain sort state for the table.
    let currentSort = {
      sortKey: null,
      direction: "asc"
    };

    // Helper function to render the table rows.
    // Note: Using a function here helps us redraw the table after sorting.
    const renderRows = (data) => {
      tbody.html(""); // Clear previous rows.
      data.forEach(song => {
        const row = tbody.append("tr");
        row.append("td").text(song.songName);
        // Artist cell with clickable artist names.
        const artistCell = row.append("td");
        song.artist.split(",").map(s => s.trim()).forEach((artistName, i, arr) => {
          artistCell.append("span")
            .text(artistName)
            .style("cursor", "pointer")
            .style("text-decoration", "underline")
            .on("click", (event) => {
              event.stopPropagation();
              d3.select("#search-input").property("value", artistName);
              const matchingNode = this.state.globalNodes.find(
                n => n.id.toLowerCase() === artistName.toLowerCase()
              );
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
      });
    };

    // Create header row with sorting functionality.
    const headerRow = thead.append("tr");
    headers.forEach(header => {
      const th = headerRow.append("th").text(header.label);
      if (header.sortKey) {
        th.style("cursor", "pointer")
          .on("click", function() {
            // Toggle sort order if same sort key; otherwise default to ascending.
            if (currentSort.sortKey === header.sortKey) {
              currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
            } else {
              currentSort.sortKey = header.sortKey;
              currentSort.direction = "asc";
            }

            // Optional: update header labels with sort indicator.
            headerRow.selectAll("th").each(function(d, i) {
              const cell = d3.select(this);
              // Remove any arrow from all sortable headers.
              if (cell.attr("data-sortable") === "true") {
                const baseText = cell.text().replace(/[\u2191\u2193]/g, '').trim();
                cell.text(baseText);
              }
            });
            // Add an arrow indicator on the clicked header.
            const arrow = currentSort.direction === "asc" ? " \u2191" : " \u2193";
            th.text(header.label + arrow);

            // Sort the songs array.
            songs.sort((a, b) => {
              let aVal = a[header.sortKey];
              let bVal = b[header.sortKey];
              // For releaseDate, convert to Date objects.
              if (header.sortKey === "releaseDate") {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
              }
              if (aVal < bVal) return currentSort.direction === "asc" ? -1 : 1;
              if (aVal > bVal) return currentSort.direction === "asc" ? 1 : -1;
              return 0;
            });

            // Redraw table rows with sorted data.
            renderRows(songs);
          });
        // Mark this header as sortable.
        th.attr("data-sortable", "true");
      }
    });

    // Initially render rows unsorted (or in default order).
    renderRows(songs);
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

  bindSVGBackgroundClick() {
    d3.select("#overlay").on("click", () => this.hideInfo());
  }

  applyTopKFilter() {
    const topK = +d3.select("#topk-input").property("value");
    d3.select("#topk-value").text(topK);

    if (topK === 0) {
      this.state.overlayElements.style("opacity", 0);
      return;
    }

    const sorted = this.state.globalNodes.slice().sort((a, b) => b.totalStreams - a.totalStreams);
    const topKSet = new Set(sorted.slice(0, topK).map(n => n.id));

    this.state.overlayElements.style("opacity", d =>
      topKSet.has(d.id) ? 1 : 0
    );

    // Only re‑highlight neighbors if an artist is selected AND the info‑panel is already visible
    if (this.state.selectedNode && d3.select("#info-panel").style("display") === "block") {
      this.highlightNeighbors(this.state.selectedNode);
    }
  }

  // Removed reference to the old "minWeight" filter per updated requirements.
  applyFilterState() {
    const topK = +d3.select("#topk-input").property("value");
    if (topK === 0) {
      this.state.overlayElements.style("opacity", 0);
      return;
    }
    this.state.nodeElements.style("opacity", 1);
    this.state.linkElements
      .style("opacity", 1)
      .attr("stroke", "#aaa");

    const sortedNodes = this.state.globalNodes.slice().sort((a, b) => b.totalStreams - a.totalStreams);
    const topKNodes = new Set(sortedNodes.slice(0, topK).map(n => n.id));
    this.state.overlayElements.style("opacity", d => topKNodes.has(d.id) ? 1 : 0);

    if (this.state.selectedNode) {
      this.highlightNeighbors(this.state.selectedNode);
    }
  }

  /* 
  Zooms and adjusts the SVG network display corresponding to the selected
  node and its first-degree related nodes (direct collaborators to the artist)
  */
zoomToNodeAndNeighbors(selectedNode, connectedNodes) {
  const { svg, nodeElements, graphGroup, zoom } = this.state;

  const bbox   = this.computeBoundingBoxWithExtremes(nodeElements, d => connectedNodes.has(d.id));
  const MARGIN = 50;
  const boxW   = bbox.xMax - bbox.xMin + MARGIN * 2;
  const boxH   = bbox.yMax - bbox.yMin + MARGIN * 2;
  const centerX = (bbox.xMin + bbox.xMax) / 2;
  const centerY = (bbox.yMin + bbox.yMax) / 2;

  const panelRect = document.getElementById("info-panel").getBoundingClientRect();
  const usableWidth = panelRect.left;
  const usableHeight = document.getElementById("artist-network-container").clientHeight;

  const scale = Math.min(usableWidth / boxW, usableHeight / boxH, 5);

  const transform = d3.zoomIdentity
    .translate(usableWidth / 2, usableHeight / 2)
    .scale(scale)
    .translate(-centerX, -centerY);

  graphGroup.selectAll(".bounding-box").remove();
  graphGroup.append("rect")
    .attr("class", "bounding-box")
    .attr("x", bbox.xMin - MARGIN)
    .attr("y", bbox.yMin - MARGIN)
    .attr("width",  boxW)
    .attr("height", boxH)
    .attr("fill", "none")
    .attr("stroke", "orange")
    .attr("stroke-dasharray", "5,5");

  svg.transition().duration(750).call(zoom.transform, transform);
}

  computeBoundingBoxWithExtremes(nodeSelection, filterFn = () => true) {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;
    
    let leftmostNode = null;
    let rightmostNode = null;
    let topmostNode = null;
    let bottommostNode = null;

    nodeSelection.each(d => {
      // Only consider nodes that pass the filterFn
      if (!filterFn(d)) return;

      // Update xMin and xMax
      if (d.x < xMin) {
        xMin = d.x;
        leftmostNode = d;
      }
      if (d.x > xMax) {
        xMax = d.x;
        rightmostNode = d;
      }

      // Update yMin and yMax
      if (d.y < yMin) {
        yMin = d.y;
        topmostNode = d;
      }
      if (d.y > yMax) {
        yMax = d.y;
        bottommostNode = d;
      }
    });

    return {
      xMin, xMax, yMin, yMax,
      leftmostNode,
      rightmostNode,
      topmostNode,
      bottommostNode
    };
  }

  minimizeInfo() {
    // Hide the panel but don’t clear the selection
    d3.select("#info-panel").style("display", "none");
  
    // Update the instruction-toggle-icon to show the artist‑pane icon
    this.showInstructionToggleIcon();
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

  /* Fits the initial graph view for when datasets are rendere for the first time */
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
      this.highlightNeighbors(artistNode);
      this.updateBackForwardButtons();
    }
  }

  updateBackForwardButtons() {
    const history = this.state.historyByYear[this.currentYear]?.history || [];
    const index   = this.state.historyByYear[this.currentYear]?.index ?? -1;
  
    d3.select("#back-button")
      .property("disabled", index <= 0);
  
    d3.select("#forward-button")
      .property("disabled", index >= history.length - 1);
  }
  


  setupUIControls() {
    // Year buttons: attach click events for dataset switching
    d3.selectAll(".year-button").on("click", event => {
      // Remove active styling from all buttons first
      d3.selectAll(".year-button").classed("active", false);
      // Then add active styling to the clicked button
      d3.select(event.target).classed("active", true);
      
      // Reset toggle icon and clear any artist selection before loading the new dataset.
      this.resetToggleIconForDatasetSwitch();
      this.clearInfoPanel();
      
      const year = d3.select(event.target).attr("data-year");
      this.loadData(year);
    });
    
    // Set active class on the button that corresponds to the preloaded dataset
    const initialYear = this.options.initialYear || "2024";
    d3.selectAll(".year-button").classed("active", false);
    d3.select(`.year-button[data-year="${initialYear}"]`).classed("active", true);
    
    // Declare a variable to hold the index of the currently highlighted suggestion
    let currentSuggestionIndex = -1;
  
    // Attach input and keydown events on the search input element
    d3.select("#search-input")
      .on("input", event => {
        const searchTerm = d3.select(event.target).property("value").trim();
        const suggestionsDiv = d3.select("#search-suggestions");
        
        // Clear suggestions if search term is empty
        if (!searchTerm) {
          suggestionsDiv.html("");
          currentSuggestionIndex = -1;
          return;
        }
        
        // Use fuse.js to filter the nodes (you could also use your topK filter here)
        const fuseOptions = {
          keys: ['id'],
          threshold: 0.3
        };
        const fuse = new Fuse(this.state.globalNodes, fuseOptions);
        const results = fuse.search(searchTerm);
        
        // Get the top 5 suggestions
        const suggestions = results.slice(0, 5).map(result => result.item);
        
        // Update suggestions dropdown
        suggestionsDiv.html("");
        currentSuggestionIndex = -1; // Reset the index whenever new suggestions are rendered
        suggestions.forEach(suggestion => {
          suggestionsDiv.append("div")
            .attr("class", "suggestion-item")
            .text(suggestion.id)
            .on("click", () => {
              // Auto-fill search input and trigger selection
              d3.select("#search-input").property("value", suggestion.id);
              suggestionsDiv.html("");
              currentSuggestionIndex = -1;
              this.state.userInteracted = true;
              this.highlightNeighbors(suggestion);
            });
        });
      })
      .on("keydown", function(event) {
        const suggestionsDiv = d3.select("#search-suggestions");
        const suggestionItems = suggestionsDiv.selectAll(".suggestion-item").nodes();
        const numSuggestions = suggestionItems.length;
        
        // Arrow Down: move selection down
        if (event.key === "ArrowDown") {
          event.preventDefault();
          currentSuggestionIndex = (currentSuggestionIndex + 1) % numSuggestions;
          highlightSuggestion(suggestionItems, currentSuggestionIndex);
        }
        // Arrow Up: move selection up
        else if (event.key === "ArrowUp") {
          event.preventDefault();
          currentSuggestionIndex = (currentSuggestionIndex - 1 + numSuggestions) % numSuggestions;
          highlightSuggestion(suggestionItems, currentSuggestionIndex);
        }
        // Enter: trigger suggestion selection or perform search based on text
        else if (event.key === "Enter") {
          event.preventDefault();
          let searchHandled = false;  // flag to determine if a valid search was executed
          if (currentSuggestionIndex >= 0 && numSuggestions > 0) {
            suggestionItems[currentSuggestionIndex].click();
            searchHandled = true;
          } else {
            // Use event.target to get the search field value
            const rawValue = d3.select(event.target).property("value");
            const searchTerm = rawValue ? rawValue.trim() : "";
            if (searchTerm) {
              const matchingNode = this.state && this.state.globalNodes
                ? this.state.globalNodes.find(n => n.id.toLowerCase() === searchTerm.toLowerCase())
                : null;
              if (matchingNode) {
                this.highlightNeighbors(matchingNode);
                searchHandled = true;
              }
            }
          }
          currentSuggestionIndex = -1;
          if (searchHandled) {
            suggestionsDiv.html("");
          }
        }
      }.bind(this)); // bind 'this' so that "this.state" and "this.highlightNeighbors" work correctly
  
    // Slider logic for topK filter
    d3.select("#topk-input")
      .on("input", event => {
        const value = event.target.value;
        d3.select("#topk-value").text(value);
        this.applyTopKFilter();
      });
  }
  
  

  resetToggleIconForDatasetSwitch() {
    // Clear any selected artist.
    this.currentArtist = null;
    
    // Optionally, reset other state flags.
    this.isInstructionView = false;
  
    // Update the toggle button to only show instructions mode.
    const toggleIcon = d3.select("#instruction-toggle-icon");
    if (!toggleIcon.empty()) {
      // Remove artist-mode styling and ensure instructions-mode is applied.
      toggleIcon.classed("artist-mode", false)
                .classed("instructions-mode", true)
                .html('<i class="fa fa-info" aria-hidden="true"></i>');
    }
    
    // Also, if needed, reset or hide the info panel.
    d3.select("#info-panel").style("display", "none");
  }
  

}


// Helper function to highlight a suggestion in the list
function highlightSuggestion(suggestionNodes, activeIndex) {
  suggestionNodes.forEach((node, index) => {
    d3.select(node).classed("active-suggestion", index === activeIndex);
  });
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