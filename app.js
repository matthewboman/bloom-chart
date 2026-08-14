const CSV_PATHS = [
  './data/2025.csv',
  './data/2024.csv',
  './data/2023.csv'
]

const MONTHS = [
  { key: 'jan',  label: 'January' },
  { key: 'feb',  label: 'February' },
  { key: 'mar',  label: 'March' },
  { key: 'apr',  label: 'April' },
  { key: 'may',  label: 'May' },
  { key: 'jun',  label: 'June' },
  { key: 'jul',  label: 'July' },
  { key: 'aug',  label: 'August' },
  { key: 'sept', label: 'September' },
  { key: 'oct',  label: 'October' },
  { key: 'nov',  label: 'November' },
  { key: 'dec',  label: 'December' },
]

const PERIOD_COLUMNS = MONTHS.flatMap(month =>
  [1, 2, 3, 4].map(period => `${month.key}_${period}`)
)

const state = {
  datasets: new Map(),
  selectedYear: null,
  selectedFlower: null,
  view: 'year',
}

const elements = {
  chart:         document.querySelector('#chart'),
  chartScroll:   document.querySelector('#chart-scroll'),
  status:        document.querySelector('#status'),
  viewSelect:    document.querySelector('#view-select'),
  yearSelect:    document.querySelector('#year-select'),
  flowerSelect:  document.querySelector('#flower-select'),
  yearControl:   document.querySelector('#year-control'),
  flowerControl: document.querySelector('#flower-control'),
  flowerViewHeader: document.querySelector('#flower-view-header'),
  flowerViewName: document.querySelector('#flower-view-name'),
  backToFlowers: document.querySelector('#back-to-flowers'),
  chartHeader: document.querySelector('#chart-header'),
  chartHeaderScroll: document.querySelector('#chart-header-scroll'),
}

function getYearFromPath(path) {
  const match = path.match(/(\d{4})\.csv$/)

  if (!match) {
    throw new Error(`Could not determine year from "${path}"`)
  }

  return Number(match[1])
}

function normalizeFlowerName(name) {
  return String(name || '')
    .trim()
    .toLocaleLowerCase()
}

function parseBoolean(value) {
  return String(value || '').trim() === '1'
}

function normalizeRow(row) {
  const periods = {}

  PERIOD_COLUMNS.forEach(column => {
    periods[column] = parseBoolean(row[column])
  })

  return {
    name:           String(row.common_name || '').trim(),
    normalizedName: normalizeFlowerName(row.common_name),
    isNative:       parseBoolean(row.is_native),
    link:           String(row.link || '').trim(),
    periods,
  }
}

function validateHeaders(fields, path) {
  const requiredFields = [
    'common_name',
    'is_native',
    'link',
    ...PERIOD_COLUMNS,
  ]

  const missingFields = requiredFields.filter(field => !fields.includes(field))

  if (missingFields.length > 0) {
    throw new Error(
      `${path} is missing columns: ${missingFields.join(', ')}`
    )
  }
}

function loadCsv(path) {
  const year = getYearFromPath(path)

  return new Promise((resolve, reject) => {
    Papa.parse(path, {
      download: true,
      header: true,
      skipEmptyLines: true,

      complete(results) {
        try {
          validateHeaders(results.meta.fields || [], path)

          if (results.errors.length > 0) {
            const message = results.errors
              .map(error => error.message)
              .join('; ')

            throw new Error(message)
          }

          const flowers = results.data
            .map(normalizeRow)
            .filter(flower => flower.name)

          resolve({
            year,
            path,
            flowers,
          })
        } catch (error) {
          reject(error)
        }
      },

      error(error) {
        reject(error)
      },
    })
  })
}

async function loadAllData() {
  setStatus('Loading bloom data...')

  const datasets = await Promise.all(CSV_PATHS.map(loadCsv))

  datasets
    .sort((a, b) => b.year - a.year)
    .forEach(dataset => {
      state.datasets.set(dataset.year, dataset)
    })

  const years = getYears()

  if (years.length === 0) {
    throw new Error('No yearly CSV files were loaded')
  }

  state.selectedYear = years[0]

  populateYearSelect()
  populateFlowerSelect()
  clearStatus()
  render()
}

function getYears() {
  return [...state.datasets.keys()].sort((a, b) => b - a)
}

function getAllFlowers() {
  const flowerMap = new Map()

  getYears().forEach(year => {
    const dataset = state.datasets.get(year)

    dataset.flowers.forEach(flower => {
      if (!flowerMap.has(flower.normalizedName)) {
        flowerMap.set(flower.normalizedName, flower)
      }
    })
  })

  return [...flowerMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}

function findFlower(dataset, flowerName) {
  const normalizedName = normalizeFlowerName(flowerName)

  return dataset.flowers.find(
    flower => flower.normalizedName === normalizedName
  )
}

function populateYearSelect() {
  elements.yearSelect.replaceChildren()

  getYears().forEach(year => {
    const option = document.createElement('option')
    option.value = String(year)
    option.textContent = String(year)
    elements.yearSelect.append(option)
  })

  elements.yearSelect.value = String(state.selectedYear)
}

function populateFlowerSelect() {
  const flowers = getAllFlowers()

  elements.flowerSelect.replaceChildren()

  flowers.forEach(flower => {
    const option = document.createElement('option')
    option.value = flower.name
    option.textContent = flower.name
    elements.flowerSelect.append(option)
  })

  if (!state.selectedFlower && flowers.length > 0) {
    state.selectedFlower = flowers[0].name
  }

  elements.flowerSelect.value = state.selectedFlower
}

function setStatus(message, isError = false) {
  elements.status.textContent = message
  elements.status.classList.toggle('status-error', isError)
}

function clearStatus() {
  setStatus('')
}

function render() {
  elements.chartHeader.replaceChildren()
  elements.chart.replaceChildren()

  elements.yearControl.hidden = state.view !== 'year'
  elements.flowerControl.hidden = state.view !== 'flower'
  elements.flowerViewHeader.hidden = state.view !== 'flower'
  elements.flowerViewName.textContent =
    state.view === 'flower' ? state.selectedFlower : ''

  if (state.view === 'year') {
    renderYearView()
  } else {
    renderFlowerView()
  }

  elements.chartScroll.scrollLeft = 0
  elements.chartHeaderScroll.scrollLeft = 0
}

function renderYearView() {
  const dataset = state.datasets.get(state.selectedYear)

  if (!dataset) {
    setStatus(`No data found for ${state.selectedYear}`, true)
    return
  }

  const headerGrid = createGrid()
  const bodyGrid = createGrid()

  addHeaders(headerGrid, 'Flower')

  dataset.flowers.forEach((flower, rowIndex) => {
    addFlowerLabel(bodyGrid, flower, rowIndex)
    addPeriodCells(bodyGrid, flower.periods, false, rowIndex)
  })

  elements.chartHeader.append(headerGrid)
  elements.chart.append(bodyGrid)
}

function renderFlowerView() {
  if (!state.selectedFlower) {
    setStatus('Select a flower', true)
    return
  }

  const headerGrid = createGrid()
  const bodyGrid = createGrid()

  addHeaders(headerGrid, 'Year')

  getYears().forEach((year, rowIndex) => {
    const dataset = state.datasets.get(year)
    const flower = findFlower(dataset, state.selectedFlower)

    addYearLabel(bodyGrid, year, flower, rowIndex)

    addPeriodCells(
      bodyGrid,
      flower?.periods || createEmptyPeriods(),
      !flower,
      rowIndex
    )
  })

  elements.chartHeader.append(headerGrid)
  elements.chart.append(bodyGrid)
}

function createGrid() {
  const grid = document.createElement('div')
  grid.className = 'bloom-grid'
  return grid
}

function addHeaders(grid, rowLabel) {
  const corner = document.createElement('div')
  corner.className = 'grid-cell corner-cell sticky-column'
  corner.textContent = rowLabel
  grid.append(corner)

  MONTHS.forEach((month, monthIndex) => {
    const header = document.createElement('div')
    header.className = 'grid-cell month-header'
    header.style.gridColumn = `span 4`
    header.style.setProperty('--month-index', monthIndex)
    header.textContent = month.label
    grid.append(header)
  })

  const periodCorner = document.createElement('div')
  periodCorner.className = 'grid-cell period-corner sticky-column'
  periodCorner.setAttribute('aria-hidden', 'true')
  grid.append(periodCorner)

  MONTHS.forEach((month, monthIndex) => {
    for (let period = 1; period <= 4; period += 1) {
      const cell = document.createElement('div')
      cell.className = 'grid-cell period-header'
      cell.style.setProperty('--month-index', monthIndex)
      cell.textContent = period

      if (period === 1) {
        cell.classList.add('month-start')
      }

      grid.append(cell)
    }
  })
}

function addFlowerLabel(grid, flower, rowIndex) {
  const label = document.createElement('div')
  label.className = 'grid-cell row-label sticky-column'
  label.dataset.row = rowIndex

  const nameWrapper = document.createElement('div')
  nameWrapper.className = 'flower-name-wrapper'

  const link = document.createElement('a')
  link.className = 'flower-link'
  link.href = flower.link || '#'
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = flower.name

  if (!flower.link) {
    link.removeAttribute('href')
    link.removeAttribute('target')
    link.removeAttribute('rel')
    link.classList.add('flower-link-disabled')
  }

  nameWrapper.append(link)

  if (flower.isNative) {
    const nativeMarker = document.createElement('span')
    nativeMarker.className = 'native-marker'
    nativeMarker.textContent = 'Native'
    nameWrapper.append(nativeMarker)
  }

  const historyButton = document.createElement('button')
  historyButton.type = 'button'
  historyButton.className = 'flower-history-button'
  historyButton.textContent = 'All years'
  historyButton.setAttribute(
    'aria-label',
    `View ${flower.name} across all years`
  )

  historyButton.addEventListener('click', () => {
    state.selectedFlower = flower.name
    state.view = 'flower'

    elements.viewSelect.value = 'flower'
    elements.flowerSelect.value = flower.name

    render()
  })

  label.append(nameWrapper, historyButton)
  grid.append(label)
}

function addYearLabel(grid, year, flower, rowIndex) {
  const label = document.createElement('div')
  label.className = 'grid-cell row-label year-label sticky-column'
  label.dataset.row = rowIndex

  const yearText = document.createElement('span')
  yearText.textContent = year

  label.append(yearText)

  if (!flower) {
    const missingText = document.createElement('span')
    missingText.className = 'missing-label'
    missingText.textContent = 'No record'
    label.append(missingText)
  }

  grid.append(label)
}

function addPeriodCells(
  grid,
  periods,
  isMissing = false,
  rowIndex
) {
  MONTHS.forEach((month, monthIndex) => {
    for (let period = 1; period <= 4; period += 1) {
      const column = `${month.key}_${period}`
      const cell = document.createElement('div')

      cell.className = 'grid-cell bloom-cell'
      cell.dataset.row = rowIndex
      cell.style.setProperty('--month-index', monthIndex)

      if (period === 1) {
        cell.classList.add('month-start')
      }

      if (monthIndex === 11 && period === 4) {
        cell.classList.add('row-end')
      }

      if (periods[column]) {
        cell.classList.add('is-active')
      }

      if (isMissing) {
        cell.classList.add('is-missing')
      }

      cell.setAttribute(
        'aria-label',
        `${month.label}, period ${period}: ${
          periods[column] ? 'flowering' : 'not flowering'
        }`
      )

      grid.append(cell)
    }
  })
}

function createEmptyPeriods() {
  return Object.fromEntries(
    PERIOD_COLUMNS.map(column => [column, false])
  )
}

elements.viewSelect.addEventListener('change', event => {
  state.view = event.target.value
  render()
})

elements.yearSelect.addEventListener('change', event => {
  state.selectedYear = Number(event.target.value)
  render()
})

elements.flowerSelect.addEventListener('change', event => {
  state.selectedFlower = event.target.value
  render()
})

elements.backToFlowers.addEventListener('click', () => {
  state.view = 'year'
  elements.viewSelect.value = 'year'
  render()
})

elements.chart.addEventListener('pointerover', event => {
  const cell = event.target.closest('[data-row]')

  if (!cell) return

  const row = cell.dataset.row
  const previousCell = event.relatedTarget?.closest?.('[data-row]')

  if (previousCell?.dataset.row === row) return

  elements.chart
    .querySelectorAll(`[data-row="${row}"]`)
    .forEach(rowCell => rowCell.classList.add('row-hovered'))
})

elements.chart.addEventListener('pointerout', event => {
  const cell = event.target.closest('[data-row]')

  if (!cell) return

  const row = cell.dataset.row
  const nextCell = event.relatedTarget?.closest?.('[data-row]')

  if (nextCell?.dataset.row === row) return

  elements.chart
    .querySelectorAll(`[data-row="${row}"]`)
    .forEach(rowCell => rowCell.classList.remove('row-hovered'))
})

let syncingScroll = false

elements.chartScroll.addEventListener('scroll', () => {
  if (syncingScroll) return

  syncingScroll = true
  elements.chartHeaderScroll.scrollLeft = elements.chartScroll.scrollLeft
  syncingScroll = false
})

elements.chartHeaderScroll.addEventListener('scroll', () => {
  if (syncingScroll) return

  syncingScroll = true
  elements.chartScroll.scrollLeft = elements.chartHeaderScroll.scrollLeft
  syncingScroll = false
})

loadAllData().catch(error => {
  console.error(error)
  setStatus(`Unable to load bloom data: ${error.message}`, true)
})
