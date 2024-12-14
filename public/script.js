document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
   

    // Función para obtener el nombre de usuario según el ID del dispositivo
    const getUserName = (userId) => {
        return fetch(`/api/getUserName/${userId}`)
            .then(response => response.json())
            .then(data => data.name || userId)
            .catch(() => userId);
    };
// Agregar un objeto para almacenar las polilíneas (líneas de trackeo en tiempo real)
const polylines = {};
const markers = {};  // Mover esta declaración aquí para que sea accesible globalmente

// Manejar el título de la página para aplicar funciones específicas
if (document.title.includes('Mapa/Opciones')) {
    const mapContainer = document.getElementById('mapContainer');
    const map = L.map('map').setView([-33.447487, -70.673676], 13); // Posición inicial
    const noTrackList = new Set(); // Lista para manejar dispositivos que no se desean trackear

    // Crear el grupo de clústeres
    const markersCluster = L.markerClusterGroup();

    // Recuperar la última posición guardada en localStorage
    const savedPositions = JSON.parse(localStorage.getItem('devicePositions')) || {};
    const savedPolylines = JSON.parse(localStorage.getItem('devicePolylines')) || {};

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const adjustMapSize = () => {
        map.invalidateSize();
    };
    window.addEventListener('resize', adjustMapSize);
    window.addEventListener('load', adjustMapSize);

    // Función para cargar la última posición de cada dispositivo en el mapa
    const loadLastPositions = () => {
        Object.keys(savedPositions).forEach(async (userId) => {
            const { latitude, longitude } = savedPositions[userId];
            const userName = await getUserName(userId);
            const marker = L.marker([latitude, longitude]).bindPopup(`Usuario: ${userName}`);
            markers[userId] = marker;
            markersCluster.addLayer(marker); // Añadir el marcador al grupo de clústeres

            // Cargar la polilínea guardada si existe
            if (savedPolylines[userId] && savedPolylines[userId].length > 0) {
                const latLngs = savedPolylines[userId];
                polylines[userId] = L.polyline(latLngs, { color: 'blue' }).addTo(map);
            }
        });
        map.addLayer(markersCluster); // Añadir el grupo de clústeres al mapa
    };

    loadLastPositions();

    // Evento para recibir nuevas posiciones en tiempo real
    socket.on('newMessage', async (message) => {
        if (message.type === 'position') {
            const latitude = message.latitude_i / 10000000;
            const longitude = message.longitude_i / 10000000;
            const userId = message.sender || 'Unknown';
            const userName = await getUserName(userId);

            // Guardar solo la última posición en localStorage
            savedPositions[userId] = { latitude, longitude };
            localStorage.setItem('devicePositions', JSON.stringify(savedPositions));

            // Mostrar solo la última posición en el mapa
            if (!markers[userId]) {
                const marker = L.marker([latitude, longitude]).bindPopup(`Usuario: ${userName}`);
                markers[userId] = marker;
                markersCluster.addLayer(marker);
            } else {
                markersCluster.removeLayer(markers[userId]); // Eliminar el marcador anterior
                markers[userId].setLatLng([latitude, longitude]).bindPopup(`Usuario: ${userName}`);
                markersCluster.addLayer(markers[userId]); // Añadir el marcador actualizado
            }

            // Crear o actualizar la polilínea para el trackeo
            if (!polylines[userId]) {
                // Si no hay una polilínea, crear una nueva
                polylines[userId] = L.polyline([[latitude, longitude]], { color: 'blue' }).addTo(map);
                savedPolylines[userId] = [[latitude, longitude]]; // Guardar en localStorage
            } else {
                // Si ya existe la polilínea, añadir la nueva posición
                polylines[userId].addLatLng([latitude, longitude]);
                savedPolylines[userId].push([latitude, longitude]); // Guardar la nueva posición
            }

            // Actualizar localStorage con las nuevas posiciones de la polilínea
            localStorage.setItem('devicePolylines', JSON.stringify(savedPolylines));
        }
    });

    // Función para resetear el mapa y limpiar todas las polilíneas y marcadores
    const resetMap = () => {
        // Remover todos los marcadores
        markersCluster.clearLayers();

        // Remover todas las polilíneas del mapa
        Object.keys(polylines).forEach(userId => {
            if (polylines[userId]) {
                map.removeLayer(polylines[userId]);
            }
        });

        // Limpiar los objetos de marcadores y polilíneas
        Object.keys(markers).forEach(userId => delete markers[userId]);
        Object.keys(polylines).forEach(userId => delete polylines[userId]);

        // Seguir permitiendo que se añadan nuevas posiciones en tiempo real
    };

    // Asignar la función de reset al botón "Resetear Mapa"
    document.getElementById('resetMapButton').addEventListener('click', resetMap);

    document.getElementById('trackHistoryButton').addEventListener('click', () => {
        const historyDeviceId = document.getElementById('historyDeviceId').value.trim();
        const startDateTime = document.getElementById('startDateTime').value;
        const endDateTime = document.getElementById('endDateTime').value;
    
        if (historyDeviceId && startDateTime && endDateTime) {
            fetch(`/api/trackHistory?deviceId=${historyDeviceId}&startDateTime=${startDateTime}&endDateTime=${endDateTime}`)
                .then(response => response.json())
                .then(data => {
                    if (data.error) {
                        alert(data.error);
                    } else {
                        const latLngs = data.map(message => [
                            message.latitude_i / 10000000,
                            message.longitude_i / 10000000
                        ]);
    
                        if (latLngs.length > 0) {
                            // Obtener coordenadas de inicio y fin
                            const inicio = latLngs[0];
                            const fin = latLngs[latLngs.length - 1];
    
                            // Mostrar en la ventana emergente el trackeo del historial
                            const trackWindow = window.open("", "_blank", "width=800,height=600");
                            const trackDocument = trackWindow.document;
                            trackDocument.write('<html><head><title>Historial de Trackeo</title><link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" /></head><body>');
                            trackDocument.write('<div id="map" style="width: 100%; height: 100%;"></div>');
                            trackDocument.write('<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>');
                            trackDocument.write('<script>');
                            trackDocument.write('const trackMap = L.map(document.getElementById("map")).setView([' + inicio[0] + ',' + inicio[1] + '], 13);');
                            trackDocument.write('L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; <a href=\\"https://www.openstreetmap.org/copyright\\">OpenStreetMap</a> contributors" }).addTo(trackMap);');
                            trackDocument.write('L.polyline(' + JSON.stringify(latLngs) + ', { color: "blue" }).addTo(trackMap);');
                            
                            // Agregar círculo azul al punto de inicio con *tooltip*
                            trackDocument.write('L.circle([' + inicio[0] + ', ' + inicio[1] + '], { color: "green", radius: 10 }).bindTooltip("Inicio").addTo(trackMap);');
                            
                            // Agregar círculo rojo al punto final con *tooltip*
                            trackDocument.write('L.circle([' + fin[0] + ', ' + fin[1] + '], { color: "red", radius: 10 }).bindTooltip("Fin").addTo(trackMap);');
    
                            trackDocument.write('trackMap.fitBounds(L.polyline(' + JSON.stringify(latLngs) + ').getBounds());');
                            trackDocument.write('</script></body></html>');
                            trackDocument.close();
                        } else {
                            alert('No se encontraron posiciones para este dispositivo.');
                        }
                    }
                })
                .catch(error => {
                    console.error('Error al obtener el historial de trackeo:', error);
                    alert('Error al obtener el historial de trackeo.');
                });
        } else {
            alert('Por favor, ingrese un ID de dispositivo, fecha y hora válidos.');
        }
    });
    
}

if (document.title.includes('Página Principal')) {
    const topicForm = document.getElementById('topicForm');
    const unsubscribeForm = document.getElementById('unsubscribeForm');
    const changeNameForm = document.getElementById('changeNameForm');

    if (topicForm) {
        topicForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const newTopicBase = 'msh/prueba/2/json/';
            const sender = document.getElementById('newTopic').value.trim();
            const userName = prompt("Ingrese el nombre del usuario:");

            if (sender && userName) {
                const topics = [`${newTopicBase}LongFast/${sender}`, `${newTopicBase}IDTtest/${sender}`];
                topics.forEach(topic => {
                    console.log(`Subscribing to topic: ${topic}`);
                    socket.emit('subscribeTopic', topic, userName);
                });
            }
        });
    }

    if (unsubscribeForm) {
        unsubscribeForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const removeTopicBase = 'msh/prueba/2/json/';
            const sender = document.getElementById('removeTopic').value.trim();

            if (sender) {
                const topics = [`${removeTopicBase}LongFast/${sender}`, `${removeTopicBase}IDTtest/${sender}`];
                topics.forEach(topic => {
                    console.log(`Unsubscribing from topic: ${topic}`);
                    socket.emit('unsubscribeTopic', topic);
                });
            }
        });
    }

    if (changeNameForm) {
        changeNameForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const deviceId = document.getElementById('deviceIdToChange').value.trim();
            const newUserName = document.getElementById('newUserName').value.trim();

            if (deviceId && newUserName) {
                socket.emit('changeUserName', deviceId, newUserName);
                alert(`Nombre de usuario cambiado a ${newUserName}`);
            }
        });
    }
}


  
// Guardar todos los mensajes en localStorage para asegurar persistencia
socket.on('newMessage', (message) => {
    if (message.text && message.text.trim() !== '') {
        saveMessageToLocalStorage(message);
        displayRealTimeMessage(message);  // Mostrar mensaje en tiempo real si corresponde
    }
});

// Función para guardar un mensaje en localStorage
function saveMessageToLocalStorage(message) {
    const messages = JSON.parse(localStorage.getItem('messages')) || [];
    messages.push(message);

    // Guardar solo los últimos 100 mensajes en localStorage para evitar sobrecarga
    if (messages.length > 100) {
        messages.shift(); // Eliminar el mensaje más antiguo
    }
    localStorage.setItem('messages', JSON.stringify(messages));
}

// Función para asignar un color de fondo basado en el ID del dispositivo
function getColorClassById(deviceId) {
    switch (deviceId) {
        case '1f71e36d4': return 'bg-lightblue';  // Color azul claro
        case '1f71e2b60': return 'bg-lightgreen';  // Color verde claro
        case '1f71e2478': return 'bg-lightcoral';  // Color coral claro
        default: return 'bg-light';  // Color por defecto
    }
}

// Verificamos si estamos en la vista de Mensajes en Tiempo Real
if (document.title.includes('Mensajes')) {
    const liveMessagesList = document.getElementById('liveMessageList');

    // Limpiar cualquier evento previo de `newMessage` para evitar duplicados
    socket.off('newMessage');

    // Cargar mensajes desde localStorage al cargar la página
    loadMessagesFromLocalStorage();

    // Solicitar mensajes desde MongoDB
    fetchMessagesFromDatabase();

    // Evento para escuchar los nuevos mensajes desde el servidor y mostrarlos
    socket.on('newMessage', (message) => {
        // Verificar que el mensaje tenga texto válido
        if (message.text && message.text.trim() !== '') {
            displayRealTimeMessage(message);  // Mostrar el mensaje en tiempo real
        }
    });

    // Función para cargar mensajes desde localStorage
    function loadMessagesFromLocalStorage() {
        const storedMessages = JSON.parse(localStorage.getItem('messages')) || [];
        storedMessages.forEach((message) => {
            displayRealTimeMessage(message);
        });

        // Desplazarse automáticamente hacia el último mensaje
        liveMessagesList.scrollTop = liveMessagesList.scrollHeight;
    }

    // Función para solicitar mensajes desde la base de datos (en orden ascendente para Mensajes en Tiempo Real)
    function fetchMessagesFromDatabase() {
        fetch('/api/messages?order=asc')  // Solicitar los mensajes en orden ascendente
            .then(response => response.json())
            .then(messages => {
                messages.forEach((message) => {
                    displayRealTimeMessage(message);  // Mostrar cada mensaje de la base de datos
                });

                // Desplazarse automáticamente hacia abajo al cargar mensajes de la base de datos
                liveMessagesList.scrollTop = liveMessagesList.scrollHeight;
            })
            .catch(error => console.error('Error al cargar los mensajes desde MongoDB:', error));
    }

    // Función para mostrar los mensajes en tiempo real en la lista
    function displayRealTimeMessage(message) {
        const messageItem = document.createElement('li');
        messageItem.classList.add('list-group-item', getColorClassById(message.sender)); // Añadir color según el ID

        messageItem.innerHTML = `
            <div>
                <p><strong>Mensaje:</strong> ${message.text}</p>
                <p><strong>Usuario:</strong> ${message.userName || 'Desconocido'}</p>
                <p><strong>ID:</strong> ${message.sender}</p>
                <p><strong>Fecha:</strong> ${new Date(message.timestamp * 1000).toLocaleString()}</p>
            </div>
        `;

        // Añadir el nuevo mensaje a la lista de mensajes en tiempo real
        liveMessagesList.appendChild(messageItem);

        // Desplazarse automáticamente hacia abajo cuando se recibe un nuevo mensaje
        liveMessagesList.scrollTop = liveMessagesList.scrollHeight;
    }
}

// Parte de Historial de Mensajes
if (document.title.includes('Mensajes')) {
    $(document).ready(function() {
        const deviceSelect = $('#deviceSelect');
        const historyList = $('#historyList');

        // Cargar dispositivos disponibles en el multiselect
        const loadDevices = () => {
            $.ajax({
                url: '/api/devices',
                method: 'GET',
                success: function(response) {
                    deviceSelect.empty(); // Limpiar opciones anteriores
                    const seenIds = new Set();
                    response.forEach(function(device) {
                        if (!seenIds.has(device.id)) {
                            deviceSelect.append(`
                                <option value="${device.id}">${device.name} (${device.id})</option>
                            `);
                            seenIds.add(device.id);
                        }
                    });

                    // Inicializar el multiselect de Bootstrap
                    deviceSelect.multiselect({
                        nonSelectedText: 'Seleccionar Dispositivos',
                        enableFiltering: true,
                        includeSelectAllOption: true,
                        buttonWidth: '100%',
                        maxHeight: 200,
                    });
                },
                error: function(error) {
                    console.error('Error al cargar dispositivos:', error);
                }
            });
        };

        loadDevices();

        // Cargar el historial al hacer clic en el botón "Ver historial"
        $('#viewHistoryBtn').on('click', function() {
            var selectedDevices = deviceSelect.val(); // Obtener los IDs seleccionados
            if (selectedDevices && selectedDevices.length > 0) {
                // Hacer la llamada AJAX para obtener el historial de mensajes (orden descendente)
                $.ajax({
                    url: '/api/messages',
                    method: 'GET',
                    data: { ids: selectedDevices.join(','), order: 'desc' }, // Solicitar mensajes en orden descendente
                    success: function(messages) {
                        historyList.empty(); // Limpiar el historial previo
                        messages.forEach(function(message) {
                            historyList.append(`
                                <li class="list-group-item ${getColorClassById(message.sender)}">
                                    <p><strong>Mensaje:</strong> ${message.text}</p>
                                    <p><strong>Usuario:</strong> ${message.userName}</p>
                                    <p><strong>ID:</strong> ${message.sender}</p>
                                    <p><strong>Fecha:</strong> ${new Date(message.timestamp * 1000).toLocaleString()}</p>
                                </li>
                            `);
                        });

                        // Desplazarse automáticamente hacia el primer mensaje (último enviado)
                        historyList.scrollTop(0); // Mover el scroll al principio (último mensaje mostrado)
                    },
                    error: function(error) {
                        console.error('Error al cargar historial de mensajes:', error);
                    }
                });
            } else {
                alert('Por favor, selecciona al menos un dispositivo.');
            }
        });
    });
}

    
    
    
});