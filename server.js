// Importamos las librerías necesarias
const mqtt = require('mqtt');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');  // Importamos mongoose para trabajar con MongoDB
// Conexión a MongoDB
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/mqttDB';
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Conectado a MongoDB'))
  .catch(err => console.error('Error al conectar a MongoDB:', err));

// Configuración del servidor web con Express
const app = express();
const server = http.createServer(app);

// Inicializa socket.io con el servidor HTTP
const io = socketIo(server);

// Ahora puedes utilizar `io` para manejar eventos de socket.io
io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado');

  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });

  // Evento para manejar suscripciones a nuevos tópicos
  socket.on('subscribeTopic', (newTopic, userName) => {
    console.log(`Suscribiéndose al nuevo tópico: ${newTopic}`);
    client.subscribe(newTopic, (err) => {
      if (err) {
        console.error(`Error al suscribirse al tópico ${newTopic}`, err);
      } else {
        console.log(`Suscrito exitosamente al tópico: ${newTopic}`);

        const [baseTopic, id] = newTopic.split('/').slice(-2);
        const newDevice = new Device({
          id: id,
          topic: newTopic,
          type: baseTopic,
          name: userName || id // Almacena el nombre o el ID si no se proporciona un nombre
        });

        newDevice.save().then(() => {
          console.log('Dispositivo guardado en MongoDB');
        }).catch(err => {
          console.error('Error al guardar el dispositivo en MongoDB', err);
        });
      }
    });
  });

  // Evento para manejar desuscripciones de tópicos
  socket.on('unsubscribeTopic', (removeTopic) => {
    console.log(`Desuscribiéndose del tópico: ${removeTopic}`);
    client.unsubscribe(removeTopic, (err) => {
      if (err) {
        console.error(`Error al desuscribirse del tópico ${removeTopic}`, err);
      } else {
        console.log(`Desuscrito exitosamente al tópico: ${removeTopic}`);

        // Eliminar el dispositivo de la base de datos
        Device.findOneAndDelete({ topic: removeTopic }).then(() => {
          console.log('Dispositivo eliminado de MongoDB');
        }).catch(err => {
          console.error('Error al eliminar el dispositivo de MongoDB', err);
        });
      }
    });
  });

  // Evento para manejar cambio de nombre de usuario
  socket.on('changeUserName', (deviceId, newName) => {
    Device.findOneAndUpdate({ id: deviceId }, { name: newName })
      .then(() => {
          console.log(`Nombre del dispositivo ${deviceId} actualizado a ${newName}`);

          // Actualizar todos los mensajes anteriores con el nuevo nombre de usuario
          Message.updateMany({ sender: deviceId }, { userName: newName })
              .then(() => {
                  console.log(`Mensajes actualizados con el nuevo nombre de usuario: ${newName}`);
                  
                  // Emitir un evento para actualizar la UI de los clientes conectados
                  io.emit('userNameUpdated', { deviceId, newName });
              })
              .catch(err => {
                  console.error('Error al actualizar los mensajes en MongoDB', err);
              });
      })
      .catch(err => {
          console.error('Error al actualizar el nombre del dispositivo en MongoDB', err);
      });
  });
});

// Servimos los archivos estáticos desde la carpeta 'public'
app.use(express.static('public'));

// Configuración del servidor MQTT
const brokerUrl = 'mqtt://renderhp-hpz440.netbird.cloud:1883'; // Dirección del broker MQTT


// Conectamos al broker MQTT
const client = mqtt.connect(brokerUrl);


// Definimos el esquema y modelo para los mensajes
const messageSchema = new mongoose.Schema({
  type: String,
  text: String,
  timestamp: Number,
  sender: String,
  userName: String // Nuevo campo para almacenar el nombre de usuario
});

const Message = mongoose.model('Message', messageSchema);

// Definimos el esquema y modelo para los dispositivos
const deviceSchema = new mongoose.Schema({
  id: String,
  topic: String,
  type: String,
  name: String // Nuevo campo para almacenar el nombre de usuario
});

const Device = mongoose.model('Device', deviceSchema);

// Definimos el esquema y modelo para las posiciones
const positionSchema = new mongoose.Schema({
  sender: String,
  latitude_i: Number,
  longitude_i: Number,
  altitude: Number,
  timestamp: Number
});

const Position = mongoose.model('Position', positionSchema);

// Evento que se dispara cuando se conecta exitosamente al broker MQTT
client.on('connect', () => {
  console.log('Conectado al broker MQTT');

  // Recuperar dispositivos de la base de datos y suscribirse a sus tópicos
  Device.find().then(devices => {
    devices.forEach(device => {
      client.subscribe(device.topic, (err) => {
        if (err) {
          console.error(`Error al suscribirse al tópico ${device.topic}`, err);
        } else {
          console.log(`Suscrito exitosamente al tópico: ${device.topic}`);
        }
      });
    });
  }).catch(err => {
    console.error('Error al recuperar dispositivos de MongoDB', err);
  });
});

// Evento que se dispara cuando se recibe un mensaje en un tópico suscrito
client.on('message', (topic, message) => {
  try {
    const msg = JSON.parse(message.toString());
    let filteredMsg;

    if (msg.type === 'text') {
      filteredMsg = {
        type: 'text',
        text: msg.payload.text,
        timestamp: msg.timestamp,
        sender: msg.sender,
        userName: '' // Este campo se llenará posteriormente con el nombre de usuario
      };
    
      Device.findOne({ id: filteredMsg.sender })
        .then(device => {
          filteredMsg.userName = device ? device.name : filteredMsg.sender;
          return Message.findOneAndUpdate(
            { timestamp: filteredMsg.timestamp, sender: filteredMsg.sender },
            filteredMsg,
            { upsert: true }
          );
        })
        .then(() => {
          console.log('Mensaje guardado en MongoDB');
          io.emit('newMessage', filteredMsg); // Enviar el mensaje al cliente con el nombre del dispositivo
          console.log('Emitido newMessage:', filteredMsg);
        })
        .catch(err => {
          console.error('Error al procesar el mensaje', err);
        });
    } else if (msg.type === 'position') {
      filteredMsg = {
        type: 'position',
        altitude: msg.payload.altitude,
        latitude_i: msg.payload.latitude_i,
        longitude_i: msg.payload.longitude_i,
        timestamp: msg.timestamp,
        sender: msg.sender,
        userName: '' // Este campo se llenará posteriormente con el nombre de usuario
      };

      // Buscar el nombre del dispositivo y luego guardar la posición
      Device.findOne({ id: filteredMsg.sender })
        .then(device => {
          filteredMsg.userName = device ? device.name : filteredMsg.sender;

          // Guardar la posición en la base de datos
          return Position.findOneAndUpdate(
            { timestamp: filteredMsg.timestamp, sender: filteredMsg.sender }, // Evitar duplicados
            filteredMsg,
            { upsert: true }
          );
        })
        .then(() => {
          console.log('Posición guardada en MongoDB');
          io.emit('newMessage', filteredMsg); // Enviar la posición al cliente
        })
        .catch(err => {
          console.error('Error al procesar la posición', err);
        });
    }
  } catch (error) {
    console.error('Error al procesar el mensaje', error);
  }
});

// Endpoint para obtener los mensajes filtrados por dispositivos
app.get('/api/messages', (req, res) => {
  const deviceIds = req.query.ids ? req.query.ids.split(',') : [];
  const order = req.query.order || 'asc'; // Valor por defecto: ascendente
  const sortOrder = order === 'desc' ? -1 : 1; // Definir el orden según el parámetro 'order'

  const query = deviceIds.length > 0 ? { sender: { $in: deviceIds } } : {}; // Filtrar por IDs seleccionados
  Message.find(query)
      .sort({ timestamp: sortOrder })  // Ordenar por timestamp según el valor de 'order'
      .then(messages => {
          res.json(messages);
      })
      .catch(err => {
          res.status(500).json({ error: 'Error al recuperar los mensajes' });
      });
});


// Endpoint para obtener todas las posiciones
app.get('/api/positions', (req, res) => {
  Position.find().then(positions => {
    res.json(positions);
  }).catch(err => res.status(500).json({ error: 'Error al recuperar las posiciones' }));
});

// Endpoint para obtener el historial de trackeo de un dispositivo en un rango de fecha y hora específico
app.get('/api/trackHistory', (req, res) => {
  const moment = require('moment-timezone');
  const { deviceId, startDateTime, endDateTime } = req.query;

// Convertir las fechas ingresadas al formato GMT desde la zona horaria de Chile
const startTimestamp = moment.tz(startDateTime, "America/Santiago").utc().unix(); // A GMT
const endTimestamp = moment.tz(endDateTime, "America/Santiago").utc().unix(); // A GMT

// Consulta MongoDB con los timestamps en GMT
Position.find({
  sender: deviceId,
  timestamp: { $gte: startTimestamp, $lt: endTimestamp }
})
  .then(positions => {
    if (positions.length > 0) {
      res.json(positions);
    } else {
      res.status(404).json({ error: 'No se encontraron datos para este rango de tiempo.' });
    }
  })
  .catch(err => {
    console.error('Error al consultar el historial de trackeo:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });
});

// Endpoint para obtener el nombre de usuario por ID
app.get('/api/getUserName/:id', (req, res) => {
  Device.findOne({ id: req.params.id })
    .then(device => {
      if (device) {
        res.json({ name: device.name });
      } else {
        res.json({ name: null });
      }
    })
    .catch(err => res.status(500).json({ error: 'Error al obtener el nombre del usuario' }));
});

// Rutas para servir diferentes páginas HTML
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/map.html', (req, res) => {
  res.sendFile(__dirname + '/public/map.html');
});

app.get('/ubicacion.html', (req, res) => {
  res.sendFile(__dirname + '/public/ubicacion.html');
});

app.get('/mensajes.html', (req, res) => {
  res.sendFile(__dirname + '/public/mensajes.html');
});
app.get('/track.html', (req, res) => {
  res.sendFile(__dirname + '/public/track.html');
});


// Ruta para obtener todos los dispositivos
app.get('/api/devices', (req, res) => {
  Device.find({}, 'id name').then(devices => {
    res.json(devices);
  }).catch(err => {
    res.status(500).send('Error al obtener los dispositivos');
  });
});

app.get('/api/messages', (req, res) => {
  Message.find().sort({ timestamp: 1 })  // Ordena por timestamp ascendente
    .then(messages => {
      res.json(messages);
    })
    .catch(err => {
      res.status(500).json({ error: 'Error al recuperar los mensajes' });
    });
});


// Iniciamos el servidor en el puerto especificado
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor web escuchando en el puerto ${PORT}`);
});