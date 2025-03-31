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
    // Use user screen dimensions to auto-configure display dimensions
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
      .attr("id", "main-network-svg") // Add a unique ID here
      .attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("width", "100%")
      .style("height", "100%")
      .style("background-color", "transparent")

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
      .on("zoom", event => {
        graphGroup.attr("transform", event.transform);
        this.state.currentZoomScale = event.transform.k; // Save the current zoom scale
      });
      
    svg.call(zoom);
    zoom.on("start", () => { this.state.userInteracted = true; });
    return zoom;
  }

  createTooltip() {
    // Check if a tooltip already exists in the body
    // Resolves creating multiple tooltips after page revisit events.
    let tooltip = d3.select("body").select("div.network-tooltip");
    if (!tooltip.empty()) {
      return tooltip;
    }
    // Otherwise, create a new one
    return d3.select("body")
      .append("div")
      .attr("class", "network-tooltip")
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
  
    // For solo artists, update the song_ids using the chosic dataset.
    // This assumes that in the chosic CSV each song row has an 'artist_names' field.
    this.state.globalNodes.forEach(node => {
      if (node.isSoloOnly) {
        // Inefficient lookup, but gets the job done.
        let songsForArtist = [];
        for (const key in songDataMap) {
          const songData = songDataMap[key];
          if (!songData.artist_names) continue;
          // Split and normalize artist names for comparison.
          const artists = songData.artist_names.split(",").map(a => a.trim().toLowerCase());
          if (artists.includes(node.id.toLowerCase())) {
            songsForArtist.push(key);
          }
        }
        // Update the node so that the tooltip and info panel reflect the chosen dataset.
        node.song_ids = songsForArtist;
        node.songCount = songsForArtist.length;
      }
    });
  
    // Compute cumulative streams for each node.
    this.state.globalNodes.forEach(node => {
      node.totalStreams = (node.song_ids || []).reduce((sum, songID) => {
        const songData = songDataMap[songID];
        return sum + (songData && songData.streams ? songData.streams : 0);
      }, 0);
    });
  
    // Precompute ranking.
    const sortedByStreams = this.state.globalNodes.slice().sort((a, b) => b.totalStreams - a.totalStreams);
    sortedByStreams.forEach((node, index) => {
      node.rank = index + 1;
    });

    //! OPTION 1: Total stream encoded size for bubbles (adjusted by sqrt)
    // Create a scale based on total streams:
    const totalStreamExtent = d3.extent(this.state.globalNodes, d => d.totalStreams);
    this.state.totalStreamRadiusScale = d3.scaleSqrt()
      .domain(totalStreamExtent)
      .range([8, 30]);  // Adjust the range as needed


    // Clear previous graph and create new graph.
    this.state.graphGroup.selectAll("*").remove();
    this.createGraph(nodes, links, radiusScale, colorScale);
    console.log(`Total render time for ${this.currentYear}: ${performance.now() - startOverall} ms`);
    this.applyTopKFilter();
  }

  processData(datasets) {
    const allLinks = [];
    const nodeSet = new Set();
    const songMap = {};
    const degreeMap = {};
  
    // First pass: collect artists, track songs, build links
    datasets.forEach(data => {
      data.forEach(d => {
        const a1 = d.artist_1?.trim();
        const a2 = d.artist_2?.trim();
        if (!a1) return;
  
        nodeSet.add(a1);
        if (a2) nodeSet.add(a2);
  
        // Parse song_ids reliably
        let songs = [];
        try {
          const parsed = JSON.parse(d.song_ids.replace(/'/g, '"'));
          songs = Array.isArray(parsed) ? parsed : d.song_ids.split(",").map(s => s.trim());
        } catch {
          songs = d.song_ids.split(",").map(s => s.trim());
        }
  
        // Always assign songs to artist_1
        songMap[a1] = songMap[a1] || new Set();
        songs.forEach(song => songMap[a1].add(song));
  
        // If it's a solo artist row
        if (!a2 || +d.count === 0) {
          return;
        }
  
        // Build collaboration link
        const existingLink = allLinks.find(link =>
          (link.source === a1 && link.target === a2) ||
          (link.source === a2 && link.target === a1)
        );
  
        if (existingLink) {
          existingLink.linkValue += +d.count;
          existingLink.songIDs = Array.from(new Set(existingLink.songIDs.concat(songs)));
        } else {
          allLinks.push({
            source: a1,
            target: a2,
            linkValue: +d.count,
            songIDs: songs
          });
        }
  
        // Assign songs and degrees for collaborations
        songMap[a2] = songMap[a2] || new Set();
        songs.forEach(song => songMap[a2].add(song));
  
        degreeMap[a1] = (degreeMap[a1] || 0) + 1;
        degreeMap[a2] = (degreeMap[a2] || 0) + 1;
      });
    });
  
    const nodeIds = Array.from(nodeSet);
  
    // Validate and filter links
    const invalidLinks = allLinks.filter(link =>
      !nodeSet.has(link.source) || !nodeSet.has(link.target)
    );
    if (invalidLinks.length) {
      console.warn("Invalid links (missing node):", invalidLinks);
    }
    const validLinks = allLinks.filter(link =>
      nodeSet.has(link.source) && nodeSet.has(link.target)
    );
  
    // Create node objects, including solo-only tagging
    const nodes = nodeIds.map(id => {
      const degree = degreeMap[id] || 0;
      const songs = songMap[id] ? Array.from(songMap[id]) : [];
      return {
        id,
        degree,
        song_ids: songs,
        songCount: songs.length,
        isSoloOnly: degree === 0
      };
    });
  
    const degreeExtent = d3.extent(nodes, d => d.degree);
    const greenPalette = ["#cccccc", "#b2ccb2", "#95cb98", "#75c97f", "#4cc764"];
    const radiusScale = d3.scaleLinear().domain(degreeExtent).range([8, 20]);
    const colorScale = d3.scaleSequential(t => d3.interpolateRgb("#1a2e1a", window.COLLAB_COLOR)(t)).domain(degreeExtent);

    return { nodes, links: validLinks, radiusScale, colorScale };
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
      // Positions nodes such that there is no overlap and yields a static network
      const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).strength(d => d.linkValue * 0.1))
        .force("radial", d3.forceRadial(Math.min(width, this.state.height) / 4, width / 2, this.state.height / 2).strength(0.3))
        .force("charge", d3.forceManyBody().strength(-1000))
        .force("center", d3.forceCenter(width / 2, this.state.height / 2))
        .force("x", d3.forceX(width / 2).strength(0.05))
        .force("y", d3.forceY(this.state.height / 2).strength(0.05))
        .force("collide", d3.forceCollide(d => this.state.totalStreamRadiusScale(d.totalStreams) + 10).iterations(2))
        .alphaDecay(0.08)
        .alphaMin(0.02)
        .on("end", () => {
          this.labelSpecialArtists();
        });
      simulation.stop();
      for (let i = 0; i < 100; i++) simulation.tick();
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
      .attr("r", d => this.state.totalStreamRadiusScale(d.totalStreams))
      .style("fill", d => d.isSoloOnly ? window.SOLO_COLOR : colorScale(d.degree))
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .style("opacity", 0)
      .on("mouseover", (event, d) => {
        tooltip.transition().duration(200)
               .style("opacity", 0.9);
        tooltip.html(`
          <div class="network-tooltip-header">
            ${d.id} <span class="network-tooltip-rank">#${d.rank}</span>
          </div>
          <div class="network-tooltip-row">
            <span class="network-tooltip-label">Charting Songs:</span> ${d.song_ids.length}
          </div>
          <div class="network-tooltip-row">
            <span class="network-tooltip-label">Unique Artist Collabs:</span> ${d.degree}
          </div>
        `)
               .style("left", (event.pageX + 10) + "px")
               .style("top", (event.pageY - 28) + "px");
        
        // Set fixed font sizes independent of zoom:
        tooltip.select(".network-tooltip-header")
               .style("font-size", "16px"); // header is larger
        tooltip.selectAll(".network-tooltip-row")
               .style("font-size", "14px"); // content text is a bit smaller
      })
      
      
      
      .on("mouseout", () => tooltip.transition().duration(200).style("opacity", 0))
      .on("click", (event, d) => {
        event.stopPropagation();
        this.state.graphGroup.select(".special-highlights").style("display", "none");
        this.state.userInteracted = true;
        this.highlightNeighbors(d);
      });
    this.state.nodeElements.transition().duration(800).style("opacity", 1);

    this.state.overlayElements = graphGroup.append("g")
      .selectAll("circle")
      .data(nodes)
      .enter().append("circle")
      .attr("class", "overlay")
      .attr("r", d => this.state.totalStreamRadiusScale(d.totalStreams) + 4)
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
    this.labelSpecialArtists();
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
          // Color the nodes in a grey-ish shade to not contrast the white
          ? "#555"
          : "#aaa";
      });

    // Highlight connected nodes and fade out others
    this.state.nodeElements
      .style("opacity", d => connectedNodes.has(d.id) ? 1 : 0.1)
      .style("fill", d => {
        if (d.id === selected.id) {
          return window.SELECTED_NODE_COLOR;
        } else {
          return d.isSoloOnly ? window.SOLO_COLOR : this.state.globalColorScale(d.degree);
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
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("dx", d => this.state.totalStreamRadiusScale(d.totalStreams) + 4)
        .attr("dy", "0.35em")
        .text(d => d.id)
        .style("font-size", "24px")
        .style("fill", "#fff")
        .style("pointer-events", "auto")

    this.updateInfoPanel(selected, [...connectedNodes].filter(id => id !== selected.id));
    this.zoomToNodeAndNeighbors(selected, connectedNodes);
  }

  resetVisualization() {
    this.state.selectedNode = null;
    this.currentArtist = null;
    
    this.state.nodeElements
      .style("opacity", 1)
      .style("fill", d => d.isSoloOnly ? window.SOLO_COLOR : this.state.globalColorScale(d.degree));
    
    this.state.linkElements
      .style("opacity", 0)
      .style("pointer-events", "none")
      .attr("stroke", "#aaa");
    
    this.state.graphGroup.select(".dynamic-labels").remove();
    this.clearInfoPanel();
    
    // Reset the toggle icon to show instructions mode.
    this.isInstructionView = false;
    this.showInstructionToggleIcon();
    
    // Force the zoom reset to default view.
    this.fitGraphToSVG(true, true);
    
    this.labelSpecialArtists();
    
  }

  createInstructionLegend(container) {
    // Dimensions for the legend rectangle.
    const legendWidth = 480;
    const legendHeight = 20;
  
    // Overall SVG dimensions (a bit larger than the rectangle to accommodate labels).
    const svgWidth = 480;
    const svgHeight = 60;
  
    // Create an inline SVG in the given container, centered horizontally.
    const legendSvg = container.append("svg")
      .attr("width", svgWidth)
      .attr("height", svgHeight)
      .style("display", "block")
      .style("margin", "0 auto"); // Center the SVG in the container
  
    // Define the linear gradient in <defs>.
    const defs = legendSvg.append("defs");
    const legendGradient = defs.append("linearGradient")
      .attr("id", "instruction-legend-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "0%");
  
    // Example "reverse green" scale from darker to lighter. Adjust if needed.
    const reverseGreenScale = d3.scaleSequential(t => d3.interpolateRgb("#1a2e1a", window.COLLAB_COLOR)(t))
      .domain([0, 1]);
  
    legendGradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", reverseGreenScale(0));  // Darker: fewer collaborators
  
    legendGradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", reverseGreenScale(1));  // Lighter: more collaborators
  
    // Create a group that holds the rectangle and labels,
    // translated so that the legend is horizontally centered in the SVG.
    const legendGroup = legendSvg.append("g")
      // Move the group so it’s centered horizontally & vertically in our 300×60 SVG.
      .attr("transform", `translate(${(svgWidth - legendWidth) / 2}, ${(svgHeight - legendHeight) / 2 + 20})`);
  
    // Draw the gradient rectangle.
    legendGroup.append("rect")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .style("fill", "url(#instruction-legend-gradient)");
  
    // "Fewer Collaborators" label on the left
    legendGroup.append("text")
      .attr("x", 0)
      .attr("y", -5)  // Move it slightly above the rectangle
      .style("text-anchor", "start")
      .style("fill", "white")
      .style("font-size", "14px")
      .text("Fewer Collaborators");
  
    // "More Collaborators" label on the right
    legendGroup.append("text")
      .attr("x", legendWidth)
      .attr("y", -5)
      .style("text-anchor", "end")
      .style("fill", "white")
      .style("font-size", "14px")
      .text("More Collaborators");
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

      instructionContent
      .append("div")
      .html(`
        <p>
          <strong>How to explore:</strong><br>
          Click on a bubble to view that artist’s details, or use the search bar above to find an artist by name.
        </p>
        <p>
          <strong>Hide this panel:</strong><br>
          Click the minimize button in the top‑right corner if you’d like more space.
        </p>
      `);
    

    const legendContainer = instructionContent.append("div")
      .attr("class", "instruction-legend")
      .style("margin-top", "20px");

    this.createInstructionLegend(legendContainer);


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
      .style("border", "2px solid #fff")
  
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
        .style("font-size", "10px"); // 11px makes it so that 2017-2024 fits on a line
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
      return {
        songName: songData.song_name,
        artist: songData.artist_names,
        releaseDate: songData.release_date,
      };
    });
    
    // Clear any existing details and create a new details container.
    d3.select("#info-panel").select(".artist-details").remove();
    const detailsDiv = d3.select("#info-panel").append("div").attr("class", "artist-details");
    detailsDiv.append("h3").text("Songs in the Spotify Global Top 200");
    
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

  bindSVGBackgroundClick() {
    d3.select("#overlay").on("click", () => this.hideInfo());
  }

  computeSpecialNodes(nodes) {
    let maxCollabNode = null, maxDegree = -Infinity;
    let topCollabNode = null, maxCollabStreams = -Infinity;
    let topSoloNode = null, maxSoloStreams = -Infinity;
    
    nodes.forEach(d => {
      if (d.degree > maxDegree) {
        maxDegree = d.degree;
        maxCollabNode = d;
      }
      if (!d.isSoloOnly && d.totalStreams > maxCollabStreams) {
        maxCollabStreams = d.totalStreams;
        topCollabNode = d;
      }
      if (d.isSoloOnly && d.totalStreams > maxSoloStreams) {
        maxSoloStreams = d.totalStreams;
        topSoloNode = d;
      }
    });
    
    return { topSoloNode, topCollabNode, maxCollabNode };
  }

  labelSpecialArtists() {
    // Reuse cached special labels if available and if not in focused view.

    // Otherwise, remove any existing special highlights.
    this.state.graphGroup.select(".special-highlights").remove();
    
    const nodes = this.state.globalNodes;
    if (!nodes || nodes.length === 0) return;
    
    // Use the helper to compute special nodes.
    const { topSoloNode, topCollabNode, maxCollabNode } = this.computeSpecialNodes(nodes);
    
    // Build an array of special nodes, avoiding duplicates.
    let specialNodes = [];
    if (topCollabNode) specialNodes.push(topCollabNode);
    if (maxCollabNode && maxCollabNode !== topCollabNode) specialNodes.push(maxCollabNode);
    if (topSoloNode) specialNodes.push(topSoloNode);
    if (specialNodes.length === 0) return;
    
    // Create a group for all special highlights and tooltips.
    const highlightGroup = this.state.graphGroup.append("g")
      .attr("class", "special-highlights")
      .style("opacity", 0);
    // Array to store bounding boxes for collision detection.
    const placedTooltips = [];
    
    // Helper: check if two bounding boxes overlap.
    function boxesOverlap(a, b) {
      return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
    }
    
    // Set font sizes based on whether "all years" is active.
    const isAllYears = (this.currentYear === "all");
    const headerFontSize = isAllYears ? 144 : 56;
    const artistFontSize = isAllYears ? 132 : 48;
    
    // Helper function: Render tooltip for a given node in either "top" or "bottom" configuration.
    // Returns a Promise that resolves with an object containing the tooltipGroup and its bounding box.
    const renderTooltip = (node, position) => {
      const tooltipGroup = highlightGroup.append("g")
        .attr("class", "special-network-tooltip")
        .style("pointer-events", "none")
        .attr("opacity", 0.6);
      
      const textGroup = tooltipGroup.append("g")
        .attr("class", "text-group");
      
      // Determine header title based on node type.
      let headerTitle = "";
      if (node === topSoloNode) {
        headerTitle = "Most Streamed Solo Artist";
      } else if (node === topCollabNode && node === maxCollabNode) {
        headerTitle = "Most Streamed Collab Artist & Most Artist Collabs";
      } else if (node === topCollabNode) {
        headerTitle = "Most Streamed Collab Artist";
      } else if (node === maxCollabNode) {
        headerTitle = "Most Artist Collabs";
      }
      
      const headerText = textGroup.append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .style("fill", "#fff")
        .style("font-size", headerFontSize + "px")
        .style("font-weight", "bold")
        .text(headerTitle);
      
      const artistText = textGroup.append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .style("fill", "#fff")
        .style("font-size", artistFontSize + "px")
        .style("font-weight", "bold")
        .text(node.id);
      
      return new Promise(resolve => {
        setTimeout(() => {
          const headerBBox = headerText.node().getBBox();
          headerText.attr("y", headerBBox.height);
          const lineSpacing = 10;
          const artistY = headerBBox.height + lineSpacing + artistText.node().getBBox().height;
          artistText.attr("y", artistY);
          
          const textBBox = textGroup.node().getBBox();
          // Use proportional margins (applied uniformly for all years)
          const marginTop = textBBox.height * 0.05;
          const marginBottom = textBBox.height * 0.2;
          const marginX = textBBox.width * 0.1;
          
          const rectWidth = textBBox.width + marginX * 2;
          const rectHeight = textBBox.height + marginTop + marginBottom;
          
          const bgRect = tooltipGroup.insert("rect", ".text-group")
            .attr("x", -rectWidth / 2)
            .attr("y", 0)
            .attr("width", rectWidth)
            .attr("height", rectHeight)
            .attr("rx", 8)
            .attr("ry", 8)
            .style("stroke", "#fff")
            .style("stroke-width", 2);
          
          textGroup.attr("transform", `translate(0, ${marginTop})`);
          
          const arrowHeight = 12;
          let arrowPath = "";
          let totalHeight = rectHeight + arrowHeight;
          if (position === "top") {
            arrowPath = `M-10,${rectHeight} L0,${rectHeight + arrowHeight} L10,${rectHeight} Z`;
          } else {
            arrowPath = `M-10,0 L0,${-arrowHeight} L10,0 Z`;
          }
          tooltipGroup.append("path")
            .attr("d", arrowPath)
            .style("stroke-width", 2);
          
          const nodeRadius = this.state.totalStreamRadiusScale(node.totalStreams);
          const gap = 10;
          let groupFinalY;
          if (position === "top") {
            const bottomY = node.y - nodeRadius - gap;
            groupFinalY = bottomY - totalHeight;
          } else {
            const topY = node.y + nodeRadius + gap;
            groupFinalY = topY + arrowHeight;
          }
          tooltipGroup.attr("transform", `translate(${node.x}, ${groupFinalY})`);
          
          const bbox = {
            x1: node.x - rectWidth / 2,
            x2: node.x + rectWidth / 2,
            y1: (position === "bottom") ? groupFinalY - arrowHeight : groupFinalY,
            y2: (position === "top") ? (groupFinalY + totalHeight + arrowHeight) : (groupFinalY + rectHeight)
          };
          resolve({ tooltipGroup, bbox });
        }, 0);
      });
    };
    
    // Helper function: Place tooltip for a node; if collision detected, flip configuration.
    const placeTooltipForNode = async (node) => {
      // Draw a white ring around the node and allow pointer events.
      const ring = highlightGroup.append("circle")
        .attr("cx", node.x)
        .attr("cy", node.y)
        .attr("r", this.state.totalStreamRadiusScale(node.totalStreams) + 6)
        .style("fill", "none")
        .style("stroke", "#fff")
        .style("stroke-width", 20)
        .style("pointer-events", "none")
        .classed("special-ring", true);
      
      let result = await renderTooltip.call(this, node, "top");
      let collided = false;
      for (const box of placedTooltips) {
        if (boxesOverlap(result.bbox, box)) {
          collided = true;
          break;
        }
      }
      if (collided) {
        result.tooltipGroup.remove();
        result = await renderTooltip.call(this, node, "bottom");
      }
      placedTooltips.push(result.bbox);
      
      // Attach hover events to the ring.
      ring.on("mouseover", () => {
        result.tooltipGroup.transition().duration(200).attr("opacity", 1);
        result.tooltipGroup.select("rect").transition().duration(200).style("stroke-opacity", 1);
      }).on("mouseout", () => {
        result.tooltipGroup.transition().duration(200).attr("opacity", 0.6);
        result.tooltipGroup.select("rect").transition().duration(200).style("stroke-opacity", 0.6);
      });
      
      // Also attach hover events to the node itself.
      const nodeSel = this.state.nodeElements.filter(d => d.id === node.id);
      if (!nodeSel.empty()) {
        nodeSel.on("mouseover", (event, d) => {
          const tooltip = this.state.tooltip;
          
          // Show/hide the tooltip as usual
          tooltip.transition().duration(200).style("opacity", 0.9);
          tooltip.html(`
            <div class="network-tooltip-header">
              ${d.id} <span class="network-tooltip-rank">#${d.rank}</span>
            </div>
            <div class="network-tooltip-row">
              <span class="network-tooltip-label">Charting Songs:</span> ${d.song_ids.length}
            </div>
            <div class="network-tooltip-row">
              <span class="network-tooltip-label">Unique Artist Collabs:</span> ${d.degree}
            </div>
          `)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
          
          // IMPORTANT: Enforce the same font sizes you use for regular nodes
          tooltip.select(".network-tooltip-header").style("font-size", "16px");
          tooltip.selectAll(".network-tooltip-row").style("font-size", "14px");
        
          // If you also have a specialized SVG label or ring, you can still show it here,
          // but keep it separate from the HTML tooltip.
          result.tooltipGroup.transition().duration(200).attr("opacity", 1);
          result.tooltipGroup.select("rect")
            .transition().duration(200)
            .style("stroke-opacity", 1);
        })
        .on("mouseout", () => {
          // Hide the HTML tooltip
          this.state.tooltip.transition().duration(200).style("opacity", 0);
        
          // Also hide/fade the specialized annotation
          result.tooltipGroup.transition().duration(200).attr("opacity", 0.6);
          result.tooltipGroup.select("rect")
            .transition().duration(200)
            .style("stroke-opacity", 0.6);
        });
        

      }
    };
    
    // Sort special nodes by their y coordinate (ascending).
    specialNodes.sort((a, b) => a.y - b.y);
    
    (async () => {
      for (const node of specialNodes) {
        await placeTooltipForNode.call(this, node);
      }
      // Cache the rendered labels along with the current year.
      this.state.cachedSpecialLabels = this.state.graphGroup.select(".special-highlights").node();
      this.state.cachedSpecialLabelsYear = this.currentYear;
    })();
    // Fixes issue with jumbled special highlighting text on display
    highlightGroup.transition().duration(500).style("opacity", 0.6);
  }

  applyTopKFilter() {
    const topK = +d3.select("#topk-input").property("value");
    const networkSvg = d3.select("#main-network-svg");
    d3.select("#topk-value").text(topK);
  
    // If topK is 0, remove top‑K labels, proportions, and top artist highlights, then exit
    if (topK === 0) {
      this.state.overlayElements.style("opacity", 0);
      this.state.graphGroup.select('.topk-labels').remove();
      networkSvg.select(".topk-proportions").remove();
      this.state.graphGroup.select(".top-artists").remove();
      return;
    }
  
    // Sort nodes by total streams and select the topK set
    const sorted = this.state.globalNodes.slice().sort((a, b) => b.totalStreams - a.totalStreams);
    const topKSet = new Set(sorted.slice(0, topK).map(n => n.id));
  
    // Update the overlay (halo) elements' opacity for the top‑K nodes
    this.state.overlayElements.style("opacity", d =>
      topKSet.has(d.id) ? 1 : 0
    );
  
    // Remove any previously created top‑K labels
    this.state.graphGroup.select('.topk-labels').remove();
  
    // Append text labels for each top‑K node.
    this.state.graphGroup.append("g")
      .attr("class", "topk-labels")
      .selectAll("text")
      .data(this.state.globalNodes.filter(d => topKSet.has(d.id)))
      .enter().append("text")
        .attr("class", "artist-label")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("dx", d => this.state.radiusScale(d.totalStreams) + 4)
        .attr("dy", "0.35em")
        .text(d => d.id)
        .style("font-size", d => this.state.fontScale ? this.state.fontScale(d.totalStreams) + "px" : "10px")
        .style("fill", "#fff")
        .style("pointer-events", "auto");
  
    // Calculate proportions of solo vs. collaborative artists
    const topKNodes = this.state.globalNodes.filter(d => topKSet.has(d.id));
    const soloCount = topKNodes.filter(d => d.isSoloOnly).length;
    const collabCount = topKNodes.length - soloCount;
    const soloPercent = Math.round((soloCount / topKNodes.length) * 100);
    const collabPercent = Math.round((collabCount / topKNodes.length) * 100);
  
    // Remove any previous proportions group
    networkSvg.select(".topk-proportions").remove();
  
    // Get actual pixel dimensions from your main network SVG
    const svgNode = networkSvg.node();
    const { width: svgWidth, height: svgHeight } = svgNode.getBoundingClientRect();
  
    // Append a <g> container for your proportions, positioned in the bottom left.
    const proportionGroup = networkSvg.append("g")
      .attr("class", "topk-proportions")
      .attr("transform", `translate(10, ${svgHeight - 50})`);
  
    // Collab row (top line)
    proportionGroup.append("rect")
      .attr("width", 12)
      .attr("height", 12)
      .attr("x", 0)
      .attr("y", 0)
      .style("fill", "#4cc764");  // Collab color
  
    proportionGroup.append("text")
      .attr("x", 16)
      .attr("y", 10) // slight offset to vertically center text
      .style("fill", "#fff")
      .style("font-size", "12px")
      .text(`Collab: ${collabPercent}%`);
  
    // Solo row (below collab)
    proportionGroup.append("rect")
      .attr("width", 12)
      .attr("height", 12)
      .attr("x", 0)
      .attr("y", 20)
      .style("fill", "#FF6961");  // Solo color
  
    proportionGroup.append("text")
      .attr("x", 16)
      .attr("y", 30)
      .style("fill", "#fff")
      .style("font-size", "12px")
      .text(`Solo: ${soloPercent}%`);
  
    // ===== STEP 2: Identify Top Solo & Collab Artists =====
    const collabNodes = topKNodes.filter(d => !d.isSoloOnly);
    const soloNodes = topKNodes.filter(d => d.isSoloOnly);
  
    // Sort each list by total streams descending
    collabNodes.sort((a, b) => b.totalStreams - a.totalStreams);
    soloNodes.sort((a, b) => b.totalStreams - a.totalStreams);
  
    // Take the top 3 from each list
    const topCollab = collabNodes.slice(0, 3);
    const topSolo = soloNodes.slice(0, 3);
  
    // ===== STEP 3: Remove old highlights & create a new group for top artists =====
    this.state.graphGroup.select(".top-artists").remove();
    const highlightGroup = this.state.graphGroup.append("g")
      .attr("class", "top-artists");
  
    // ===== STEP 4: Append labels for top collab & top solo artists =====
  
    // Append labels for top collaborative artists
    highlightGroup.selectAll("text.collab-label")
      .data(topCollab)
      .enter().append("text")
        .attr("class", "collab-label")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("dx", d => this.state.radiusScale(d.totalStreams) + 4)
        .attr("dy", "0.35em")
        .text(d => `Top Collab: ${d.id}`)
        .style("fill", "#4cc764")
        .style("font-size", "12px")
        .style("font-weight", "bold");
  
    // Append labels for top solo artists
    highlightGroup.selectAll("text.solo-label")
      .data(topSolo)
      .enter().append("text")
        .attr("class", "solo-label")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("dx", d => this.state.radiusScale(d.totalStreams) + 4)
        .attr("dy", "0.35em")
        .text(d => `Top Solo: ${d.id}`)
        .style("fill", "#FF6961")
        .style("font-size", "12px")
        .style("font-weight", "bold");
  
    // Optionally update neighbor highlighting if needed
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

    // Compute basic extremes from node positions.
    nodeSelection.each(d => {
      if (!filterFn(d)) return;
      if (d.x < xMin) { xMin = d.x; leftmostNode = d; }
      if (d.x > xMax) { xMax = d.x; rightmostNode = d; }
      if (d.y < yMin) { yMin = d.y; topmostNode = d; }
      if (d.y > yMax) { yMax = d.y; bottommostNode = d; }
    });
  
    // Only consider labels that are not within the Top K labels container.
    d3.selectAll(".artist-label")
      .filter(function() {
        // Exclude labels if their closest ancestor has the "topk-labels" class.
        return !this.closest('.topk-labels');
      })
      .each(function(d) {
        if (!filterFn(d)) return;
        const bbox = this.getBBox();
        const dx = parseFloat(d3.select(this).attr("dx")) || 0;
        const dy = parseFloat(d3.select(this).attr("dy")) || 0;
        const labelRight = d.x + dx + bbox.width;
        // Assuming the label’s baseline is at d.y, subtract bbox.height to approximate the top edge.
        const labelTop = d.y + dy - bbox.height;
        
        if (labelRight > xMax) {
          xMax = labelRight;
          rightmostNode = d;
        }
        if (labelTop < yMin) {
          yMin = labelTop;
          topmostNode = d;
        }
      });
  
    return { xMin, xMax, yMin, yMax, leftmostNode, rightmostNode, topmostNode, bottommostNode };
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

  minimizeInfo() {
    // Hide the panel but don’t clear the selection
    d3.select("#info-panel").style("display", "none");
    // Update the instruction-toggle-icon to show the artist‑pane icon
    this.showInstructionToggleIcon();
  }

  /* Fits the initial graph view for when datasets are rendere for the first time */
  fitGraphToSVG(final = false, forceReset = false) {
    // Only skip if not forced to reset and if the user has interacted.
    if (!forceReset && this.state.userInteracted) return;
    
    const { svg, width, nodeElements } = this.state;
    const { xMin, xMax, yMin, yMax } = this.computeBoundingBox(nodeElements);
    const networkWidth = xMax - xMin;
    const networkHeight = yMax - yMin;
    const centerX = (xMax + xMin) / 2;
    const centerY = (yMax + yMin) / 2;
    const circleRadius = Math.min(width, this.state.height) / 2;
    const networkSize = Math.max(networkWidth, networkHeight);
    const computedScale = circleRadius / (networkSize / 2);
    
    svg.transition().duration(final ? 1000 : 300).call(
      this.state.zoom.transform,
      d3.zoomIdentity.translate(width / 2, this.state.height / 2)
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
    const history = this.state.historyByYear[this.currentYear]?.history || [];
    const index = this.state.historyByYear[this.currentYear]?.index ?? -1;

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
              this.state.graphGroup.select(".special-highlights").style("display", "none");
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
                  // Hide specialized annotations before highlighting the matching artist.
                  this.state.graphGroup.select(".special-highlights").style("display", "none");
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

//! HELPER FUNCTIONS
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