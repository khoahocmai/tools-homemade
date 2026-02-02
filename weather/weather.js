// Configuration
const API_KEY = '3f40d381342d444faae94519252609'; // vào đây lấy api key https://www.weatherapi.com/my/ 
const API_BASE = 'https://api.weatherapi.com/v1';

// Default values for error handling
const DEFAULT_WEATHER = {
  city: 'Không xác định',
  country: 'VN',
  temp: 20,
  feelsLike: 18,
  condition: 'Dữ liệu không khả dụng',
  icon: '❌',
  humidity: 65,
  windSpeed: 5,
  pressure: 1013,
  visibility: 10,
  uvIndex: 3,
  sunrise: '06:00',
  sunset: '18:00',
};

// State
let state = {
  isCelsius: true,
  isDarkMode: localStorage.getItem('theme') === 'dark',
  currentWeather: null,
  forecastData: null,
  searchQuery: '',
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  setupEventListeners();
  loadWeatherByGeolocation();
});

// Theme Management
function initializeTheme() {
  const isDark = state.isDarkMode;
  if (isDark) {
    document.documentElement.classList.add('dark-mode');
    updateThemeToggleUI();
  }
}

function setupEventListeners() {
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('tempToggle').addEventListener('click', toggleTemperature);
  document.getElementById('searchBtn').addEventListener('click', handleSearch);
  document.getElementById('geoBtn').addEventListener('click', loadWeatherByGeolocation);
  document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
}

function toggleTheme() {
  state.isDarkMode = !state.isDarkMode;
  localStorage.setItem('theme', state.isDarkMode ? 'dark' : 'light');

  if (state.isDarkMode) {
    document.documentElement.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
  }
  updateThemeToggleUI();
}

function updateThemeToggleUI() {
  // Visual update is handled by CSS
}

function toggleTemperature() {
  state.isCelsius = !state.isCelsius;
  const btn = document.getElementById('tempToggle');
  btn.textContent = state.isCelsius ? '°C' : '°F';

  if (state.currentWeather) {
    displayCurrentWeather(state.currentWeather);
  }
  if (state.forecastData) {
    displayForecast(state.forecastData);
  }
}

// Search and Geolocation
function handleSearch() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;

  state.searchQuery = query;
  loadWeather(query);
}

function loadWeatherByGeolocation() {
  const btn = document.getElementById('geoBtn');
  btn.disabled = true;
  btn.style.opacity = '0.5';

  if (!navigator.geolocation) {
    showError('Geolocation không được hỗ trợ');
    btn.disabled = false;
    btn.style.opacity = '1';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      loadWeatherByCoordinates(latitude, longitude);
      btn.disabled = false;
      btn.style.opacity = '1';
    },
    (error) => {
      console.error('Geolocation error:', error);
      loadWeather('Ha Noi'); // Fallback to default city
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  );
}

function loadWeatherByCoordinates(lat, lon) {
  loadWeatherAPI(`${lat},${lon}`);
}

// API Calls with Error Handling
function loadWeather(query) {
  loadWeatherAPI(query);
}

async function loadWeatherAPI(query) {
  try {
    showLoadingStates(true);

    // Fetch current weather
    const currentRes = await fetch(
      `${API_BASE}/current.json?key=${API_KEY}&q=${encodeURIComponent(query)}&aqi=yes&lang=vi`
    );

    if (!currentRes.ok) {
      console.log('Current weather fetch failed:', currentRes);
      throw new Error(`API Error: ${currentRes.status}`);
    }

    const currentData = await currentRes.json();
    state.currentWeather = currentData;

    // Fetch forecast
    const forecastRes = await fetch(
      `${API_BASE}/forecast.json?key=${API_KEY}&q=${encodeURIComponent(query)}&days=5&aqi=no&lang=vi`
    );

    if (!forecastRes.ok) {
      throw new Error(`Forecast Error: ${forecastRes.status}`);
    }

    const forecastData = await forecastRes.json();
    state.forecastData = forecastData;

    // Update search input
    document.getElementById('searchInput').value = '';

    // Display data
    displayCurrentWeather(currentData);
    displayForecast(forecastData);
    hideError();

  } catch (error) {
    console.error('Weather API Error:', error);
    showError(`Lỗi tải dữ liệu: ${error.message || 'Vui lòng thử lại'}`);
    displayDefaultWeather();
  } finally {
    showLoadingStates(false);
  }
}

// Display Functions
function displayCurrentWeather(data) {
  try {
    const current = data.current;
    const location = data.location;

    const temp = state.isCelsius ? current.temp_c : current.temp_f;
    const feelsLike = state.isCelsius ? current.feelslike_c : current.feelslike_f;
    const unit = state.isCelsius ? '°C' : '°F';

    const elements = {
      cityName: `${location.name}, ${location.region}`,
      temperature: Math.round(temp),
      feelsLike: `${Math.round(feelsLike)}${unit}`,
      weatherDesc: current.condition.text,
      weatherIcon: getWeatherIcon(current.condition.code),
      humidity: `${current.humidity}%`,
      windSpeed: `${Math.round(current.wind_kph)} km/h`,
      pressure: `${current.pressure_mb} mb`,
      visibility: `${Math.round(current.vis_km)} km`,
      uvIndex: Math.round(current.uv),
      lastUpdate: `Cập nhật: ${new Date(current.last_updated).toLocaleTimeString('vi-VN')}`,
    };

    // Get astronomy data
    const astroDate = data.forecast.forecastday[0].astro;
    elements.sunrise = astroDate.sunrise.split(' ')[0];
    elements.sunset = astroDate.sunset.split(' ')[0];

    // Update DOM
    document.getElementById('cityName').textContent = elements.cityName;
    document.getElementById('temperature').textContent = elements.temperature;
    document.getElementById('feelsLike').textContent = elements.feelsLike;
    document.getElementById('weatherDesc').textContent = elements.weatherDesc;
    document.getElementById('weatherIcon').src = `https:${current.condition.icon}`;
    document.getElementById('humidity').textContent = elements.humidity;
    document.getElementById('windSpeed').textContent = elements.windSpeed;
    document.getElementById('pressure').textContent = elements.pressure;
    document.getElementById('visibility').textContent = elements.visibility;
    document.getElementById('uvIndex').textContent = elements.uvIndex;
    document.getElementById('sunrise').textContent = elements.sunrise;
    document.getElementById('sunset').textContent = elements.sunset;
    document.getElementById('lastUpdate').textContent = elements.lastUpdate;

    // Update unit display
    document.querySelector('.unit').textContent = state.isCelsius ? '°C' : '°F';

    // Show card
    document.getElementById('currentWeatherCard').style.display = 'block';

  } catch (error) {
    console.error('Display error:', error);
    displayDefaultWeather();
  }
}

function displayForecast(data) {
  try {
    const hourlyContainer = document.getElementById('hourlyForecast');
    const dailyContainer = document.getElementById('dailyForecast');

    hourlyContainer.innerHTML = '';
    dailyContainer.innerHTML = '';

    // Hourly forecast (next 24 hours)
    const todayHours = data.forecast.forecastday[0].hour;
    const currentHour = new Date().getHours();
    const upcomingHours = todayHours.slice(currentHour, currentHour + 24);

    upcomingHours.forEach(hour => {
      const time = new Date(hour.time).getHours();
      const temp = state.isCelsius ? hour.temp_c : hour.temp_f;

      const hourDiv = document.createElement('div');
      hourDiv.className = 'hourly-item';
      hourDiv.innerHTML = `
                <div class="hourly-time">${String(time).padStart(2, '0')}:00</div>
                <img src="https:${hour.condition.icon}" alt="weather" class="hourly-icon">
                <div class="hourly-temp">${Math.round(temp)}°</div>
                <div class="hourly-condition">${hour.condition.text}</div>
            `;
      hourlyContainer.appendChild(hourDiv);
    });

    // Daily forecast (5 days)
    data.forecast.forecastday.forEach(day => {
      const maxTemp = state.isCelsius ? day.day.maxtemp_c : day.day.maxtemp_f;
      const minTemp = state.isCelsius ? day.day.mintemp_c : day.day.mintemp_f;
      const avgTemp = state.isCelsius ? day.day.avgtemp_c : day.day.avgtemp_f;

      const date = new Date(day.date);
      const dateStr = date.toLocaleDateString('vi-VN', { weekday: 'short', month: 'short', day: 'numeric' });

      const dayDiv = document.createElement('div');
      dayDiv.className = 'daily-item';
      dayDiv.innerHTML = `
                <div class="daily-date">${dateStr}</div>
                <img src="https:${day.day.condition.icon}" alt="weather" class="daily-icon">
                <div class="daily-condition">${day.day.condition.text}</div>
                <div class="daily-temps">
                    <div class="temp-item">
                        <span class="temp-label">Max</span>
                        <span class="temp-value">${Math.round(maxTemp)}°</span>
                    </div>
                    <div class="temp-item">
                        <span class="temp-label">Min</span>
                        <span class="temp-value">${Math.round(minTemp)}°</span>
                    </div>
                </div>
                <div class="daily-details">
                    <div class="detail-row">
                        <span class="detail-name">💧 Ẩm độ</span>
                        <span class="detail-data">${day.day.avghumidity}%</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-name">💨 Gió</span>
                        <span class="detail-data">${Math.round(day.day.maxwind_kph)} km/h</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-name">☔ Mưa</span>
                        <span class="detail-data">${day.day.daily_chance_of_rain}%</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-name">☀️ UV</span>
                        <span class="detail-data">${Math.round(day.day.uv)}</span>
                    </div>
                </div>
            `;
      dailyContainer.appendChild(dayDiv);
    });

    // Show containers
    hourlyContainer.style.display = 'flex';
    dailyContainer.style.display = 'grid';

  } catch (error) {
    console.error('Forecast display error:', error);
  }
}

function displayDefaultWeather() {
  try {
    document.getElementById('cityName').textContent = DEFAULT_WEATHER.city;
    document.getElementById('temperature').textContent = DEFAULT_WEATHER.temp;
    document.getElementById('feelsLike').textContent = `${DEFAULT_WEATHER.feelsLike}°`;
    document.getElementById('weatherDesc').textContent = DEFAULT_WEATHER.condition;
    document.getElementById('humidity').textContent = `${DEFAULT_WEATHER.humidity}%`;
    document.getElementById('windSpeed').textContent = `${DEFAULT_WEATHER.windSpeed} km/h`;
    document.getElementById('pressure').textContent = `${DEFAULT_WEATHER.pressure} mb`;
    document.getElementById('visibility').textContent = `${DEFAULT_WEATHER.visibility} km`;
    document.getElementById('uvIndex').textContent = DEFAULT_WEATHER.uvIndex;
    document.getElementById('sunrise').textContent = DEFAULT_WEATHER.sunrise;
    document.getElementById('sunset').textContent = DEFAULT_WEATHER.sunset;

    document.getElementById('currentWeatherCard').style.display = 'block';
  } catch (error) {
    console.error('Default weather display error:', error);
  }
}

// Utility Functions
function showLoadingStates(isLoading) {
  document.getElementById('currentLoading').style.display = isLoading ? 'flex' : 'none';
  document.getElementById('hourlyLoading').style.display = isLoading ? 'flex' : 'none';
  document.getElementById('dailyLoading').style.display = isLoading ? 'flex' : 'none';

  if (!isLoading) {
    document.getElementById('currentWeatherCard').style.display = 'block';
    const hourly = document.getElementById('hourlyForecast');
    const daily = document.getElementById('dailyForecast');
    if (hourly.children.length > 0) hourly.style.display = 'flex';
    if (daily.children.length > 0) daily.style.display = 'grid';
  }
}

function showError(message) {
  const errorEl = document.getElementById('errorMessage');
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

function hideError() {
  document.getElementById('errorMessage').style.display = 'none';
}

function getWeatherIcon(code) {
  // WeatherAPI condition codes mapping
  const iconMap = {
    1000: '☀️',  // Sunny
    1003: '⛅',  // Partly cloudy
    1006: '☁️',  // Cloudy
    1009: '☁️',  // Overcast
    1030: '🌫️',  // Mist
    1063: '🌧️',  // Patchy rain possible
    1066: '❄️',  // Patchy snow possible
    1069: '🌨️',  // Patchy sleet possible
    1072: '🌨️',  // Patchy freezing drizzle possible
    1087: '⛈️',  // Thundery outbreaks possible
    1114: '❄️',  // Blizzard
    1117: '🌨️',  // Blizzard
    1135: '🌫️',  // Fog
    1147: '🌫️',  // Freezing fog
    1150: '🌧️',  // Patchy light drizzle
    1153: '🌧️',  // Light drizzle
    1168: '❄️',  // Freezing drizzle
    1171: '❄️',  // Heavy freezing drizzle
    1180: '🌧️',  // Patchy light rain
    1183: '🌧️',  // Light rain
    1186: '🌧️',  // Moderate rain at times
    1189: '🌧️',  // Moderate rain
    1192: '🌧️',  // Heavy rain at times
    1195: '⛈️',  // Heavy rain
  };

  return iconMap[code] || '🌤️';
}
