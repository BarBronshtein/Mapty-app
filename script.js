'use strict';

// prettier-ignore

class Workout {
  date = new Date();
  id = (Date.now() + '').slice(-9);
  constructor(coords, distance, duration) {
    this.coords = coords; // [lat,lng]
    this.distance = distance; // in km
    this.duration = duration; // in min
  }

  _setDescription() {
      // prettier-ignore
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    this.description=`${this.type[0].toUpperCase()}${this.type.slice(1)} on ${months.at(this.date.getMonth())} ${this.date.getDate()}`
  }
}

class Running extends Workout {
  type = 'running';
  constructor(coords, distance, duration, cadence) {
    super(coords, distance, duration);
    this.cadence = cadence;
    this.calcPace();
    this._setDescription();
  }
  calcPace() {
    // min/km
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

class Cycling extends Workout {
  type = 'cycling';
  constructor(coords, distance, duration, elevationGain) {
    super(coords, distance, duration);
    this.elevationGain = elevationGain;
    this.calcSpeed();
    this._setDescription();
  }
  calcSpeed() {
    // km/h
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

///////////////////////////////////////////
// Application architecture

// Elements
const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const clear = document.querySelector('.clear-btn');
const edit = document.querySelector('.edit-btn');
const overview = document.querySelector('.overview-btn');
const sortType = document.querySelector('.sort__input--type');
let coords;
let isRunning = false;
const weatherApiKey = 'bc9f1861b1e4be1abbe49394ce3d7058';

class App {
  index;
  #marks = [];
  #map;
  #mapEvent;
  #workouts = [];
  _mapZoomLevel = 15;
  constructor() {
    // Get user's position
    this._getPosition();

    // Get data from  local storage
    this._getLocalStorage();

    // Attach event handlers
    form.addEventListener('submit', this._newWorkout.bind(this));
    inputType.addEventListener('change', this._toggleElevationField);
    sortType.addEventListener('change', this.sort.bind(this));
    containerWorkouts.addEventListener('click', this._moveToMarker.bind(this));

    clear.addEventListener('click', this.reset.bind(this));
    edit.addEventListener('click', this.edit.bind(this));
    overview.addEventListener('click', this._overview.bind(this));
  }

  _getPosition() {
    navigator.geolocation.getCurrentPosition(
      this._loadMap.bind(this),
      function () {
        alert('Could not get your position');
      }
    );
  }

  _loadMap(position) {
    const { latitude } = position.coords;
    const { longitude } = position.coords;

    coords = [latitude, longitude];

    this.#map = L.map('map').setView(coords, this._mapZoomLevel);

    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot//{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);

    // Handling clicks on map
    this.#map.on('click', this._showForm.bind(this));

    this.#workouts.forEach(work => this.renderWorkoutMarker(work));
  }

  _showForm(mapE) {
    if (containerWorkouts.classList.contains('shaker') && isRunning) return;

    //if mapE is undefined (when we editworkout) then the coords are taken of #mapEvent

    // if (!mapE) {
    // } else {
    //   this.#mapEvent = mapE.latlng;
    // }
    mapE ? (this.#mapEvent = mapE.latlng) : mapE;

    form.classList.remove('hidden');
    inputDistance.focus();
  }

  _hide() {
    inputCadence.value =
      inputDistance.value =
      inputDuration.value =
      inputElevation.value =
        '';
    form.style.display = 'none';
    form.classList.add('hidden');
    setTimeout(() => (form.style.display = 'grid'), 1000);
  }

  _toggleElevationField() {
    inputElevation.closest('.form__row').classList.toggle('form__row--hidden');
    inputCadence.closest('.form__row').classList.toggle('form__row--hidden');
  }

  _newWorkout(e) {
    const validInputs = (...inputs) =>
      inputs.every(inp => Number.isFinite(inp));

    const allPositive = (...inputs) => inputs.every(inp => inp > 0);

    e.preventDefault();

    // Get data from form
    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;

    const { lat, lng } = this.#mapEvent;

    let workout;
    // If activity running, create running object
    if (type === 'running') {
      const cadence = +inputCadence.value;
      // Check if data is valid
      if (
        // !Number.isFinite(distance) ||
        // !Number.isFinite(duration) ||
        // !Number.isFinite(cadence)
        !validInputs(distance, duration, cadence) ||
        !allPositive(distance, duration, cadence)
      )
        return;
      // return alert('Inputs have to be positive numbers!');

      workout = new Running([lat, lng], distance, duration, cadence);
    }

    // If activity cycling, create cycling object
    if (type === 'cycling') {
      const elevation = +inputElevation.value;
      if (
        !validInputs(distance, duration, elevation) ||
        !allPositive(distance, duration)
      )
        return;
      // return alert('Inputs have to be positive numbers!');

      workout = new Cycling([lat, lng], distance, duration, elevation);
    }

    // Add new object to workout array
    this.#workouts.push(workout);

    // Render workout on map  as marker

    this.renderWorkoutMarker(workout);

    // Weather description

    // Render workout on list
    this._renderWorkout(workout);

    // Hide form + Clear input fields
    this._hide();

    // Sort workouts by current option
    this.sort();

    // Set local storage to all workouts
    this._setLocalStorage();
  }

  async getLocation(coords) {
    const [lat, lng] = coords;

    let loc;
    try {
      const reverseGeo = await fetch(
        `https://geocode.xyz/${lat},${lng}?geoit=json`
      );
      if (!reverseGeo.ok)
        throw new Error('Problem with geoCoding getting location data');
      loc = await reverseGeo.json();
    } catch (err) {
      console.error(err);
    }
    return loc;
  }

  async renderWorkoutMarker(workout) {
    if (workout.coords[0] === undefined || workout.coords[1] === undefined) {
      workout.coords = this.#mapEvent;
    }
    // const loc = await this.getLocation(workout.coords);
    // const data =
    //   loc !== undefined
    //     ? ` ,${workout.constructor.name} in ${loc?.city ?? ''}, ${
    //         loc?.country ?? ''
    //       }`
    //     : '';

    // Displaying city and country with weather insteadof geolocation because a lack of api key
    const weather = await this.weather(workout.coords);

    const data =
      weather !== undefined
        ? ` ,${workout.constructor.name} in ${weather?.name ?? ''}, ${
            weather?.sys.country ?? ''
          }`
        : '';

    const maptyIcon = L.icon({
      iconUrl: 'icon.png',
      iconSize: [66, 95],
      iconAnchor: [32, 45],
    });
    const mark = L.marker(workout.coords, { icon: maptyIcon })
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          maxwidth: 250,
          minwidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        })
      )
      .setPopupContent(
        `${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'} ${
          workout.description
        }${data}`
      )
      .openPopup();

    // Add marker to marks array
    this.#marks.push(mark);
  }
  async weather(coords) {
    const [lat, lon] = coords;
    let resWeatherData;
    try {
      const promiseWeatherData = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherApiKey}`
      );
      if (!promiseWeatherData.ok)
        throw new Error('Problem with getting weather data');
      resWeatherData = await promiseWeatherData.json();
    } catch (err) {
      console.error(err);
    }
    return resWeatherData;
  }
  async weatherDescription(coords, element) {
    const weather = await this.weather(coords);
    const localWeather = `<h4>We expect to have ${
      weather.weather.at(0).main
    } and feels like ${(weather.main.feels_like - 273).toFixed(1)}°C</h4>`;
    element.insertAdjacentHTML('afterbegin', localWeather);
  }

  _renderWorkout(workout) {
    let html = `<li class="workoutd workout--${workout.type}" data-id=${
      workout.id
    }>
    <button class="remove--workout hidden">x</button>
    <h2 class="workout__title">${workout.description}
    </h2>
    <div class="workout__details">
    <span class="workout__icon">${
      workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'
    }</span>
      <span class="workout__value">${workout.distance}</span>
      <span class="workout__unit">km</span>
      </div>
      <div class="workout__details">
      <span class="workout__icon">⏱</span>
      <span class="workout__value">${workout.duration}</span>
      <span class="workout__unit">min</span>
      </div>`;

    if (workout.type === 'running')
      html += `<div class="workout__details">
      <span class="workout__icon">⚡️</span>
      <span class="workout__value">${workout.pace.toFixed(1)}</span>
      <span class="workout__unit">min/km</span>
      </div>
      <div class="workout__details">
    <span class="workout__icon">🦶🏼</span>
    <span class="workout__value">${workout.cadence}</span>
    <span class="workout__unit">spm</span>
  </div>
  </li>`;

    if (workout.type === 'cycling')
      html += `<div class="workout__details">
      <span class="workout__icon">⚡️</span>
      <span class="workout__value">${workout.speed.toFixed(1)}</span>
      <span class="workout__unit">km/h</span>
      </div>
      <div class="workout__details">
      <span class="workout__icon">⛰</span>
      <span class="workout__value">${workout.elevationGain}</span>
      <span class="workout__unit">m</span>
      </div>
      </li>`;
    form.insertAdjacentHTML('afterend', html);
    const element = document.querySelector('.workoutd');
    this.weatherDescription(workout.coords, element);
  }

  _moveToMarker(e) {
    const workoutEl = e.target.closest('.workoutd');

    // Guard
    if (!workoutEl) return;

    const workout = this.#workouts.find(
      work => work.id === workoutEl.dataset.id
    );
    // this.getLocation(workout.coords)

    //Guard to when we editworkout because we remove it from the array
    if (!workout) return;
    this.#map.setView(workout.coords, this._mapZoomLevel, {
      animate: true,
      pan: { duration: 1 },
    });
  }

  _setLocalStorage() {
    localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  }

  _getLocalStorage() {
    const data = JSON.parse(localStorage.getItem('workouts'));

    if (!data) return;

    this.#workouts = data;

    this.#workouts.forEach(work => {
      work =
        work.type === 'running'
          ? Object.setPrototypeOf(work, Running.prototype)
          : Object.setPrototypeOf(work, Cycling.prototype);
      this._renderWorkout(work);
    });
  }

  reset() {
    localStorage.clear();
    localStorage.removeItem('workouts');
    location.reload();
  }

  edit() {
    if (
      !this.#workouts.at(0) ||
      !form.classList.contains('hidden') ||
      isRunning
    )
      return;
    isRunning = true;

    containerWorkouts.classList.add('shaker');
    const remove = containerWorkouts.querySelectorAll('.remove--workout');
    const workout = containerWorkouts.querySelectorAll('.workoutd');
    workout.forEach(cur => {
      cur.addEventListener('click', this.editWorkout.bind(this));
    });
    remove.forEach(btn => {
      btn.classList.remove('hidden');
      btn.addEventListener('click', this.removeWorkout.bind(this));
    });
  }

  editWorkout(e) {
    // Guard
    if (e.target.classList.contains('remove--workout') || !isRunning) return;
    const el = e.target.closest('.workoutd');

    this.index = this.#workouts.findIndex(w => w.id === el.dataset.id);

    // if (!this.#workouts[this.index]) {
    // } else
    this.#mapEvent = this.#workouts[this.index].coords;
    this.removeWorkout(e);
    this._showForm();
    form.addEventListener('submit', this._newWorkout.bind(this));

    // Remove shaker and removeworkout style
    // this.removeStyle();
    isRunning = false;

    // Sort workouts
    this.sort();

    // Update localStorage
    this._setLocalStorage();
  }

  removeStyle() {
    const remove = containerWorkouts.querySelectorAll('.remove--workout');
    remove.forEach(btn => btn.classList.add('hidden'));

    containerWorkouts.classList.remove('shaker');
  }

  removeWorkout(e) {
    if (!isRunning) return;
    const el = e.target.closest('.workoutd');
    const index = this.#workouts.findIndex(i => i.id === el.dataset.id);

    // Guard
    // if (!this.#marks[index]) return;
    isRunning = false;

    this.#workouts.splice(index, 1);
    el.remove();
    this.#map.setView(coords, 15);

    this.removeStyle();
    console.log(index, this.#marks);

    this.#marks[index]?.remove() ?? this.#marks;
    this.#marks.splice(index, 1);
    console.log(this.#marks);

    isRunning = false;
    this._setLocalStorage();
  }

  sort() {
    this.#workouts.sort((a, b) => b.distance - a.distance);

    // Update html order
    document.querySelectorAll('.workoutd').forEach(el => el.remove());

    this.#workouts.forEach(w => this._renderWorkout(w));

    // Update local storage
    this._setLocalStorage();
  }

  _overview() {
    // if there are no workouts return
    if (this.#workouts.length === 0) return;

    // find lowest and highest lat and long to make map bounds that fit all markers
    const latitudes = this.#workouts.map(w => {
      return w.coords[0];
    });
    const longitudes = this.#workouts.map(w => {
      return w.coords[1];
    });
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLong = Math.min(...longitudes);
    const maxLong = Math.max(...longitudes);
    // fit bounds with coordinates
    this.#map.fitBounds(
      [
        [maxLat, minLong],
        [minLat, maxLong],
      ],
      { padding: [70, 70] }
    );
  }
}

const mapty = new App();
