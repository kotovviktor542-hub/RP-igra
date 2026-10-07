/* быстрая проверка MQTT-клиента на публичном брокере */
const WS = require('./../node_modules/ws');
(async () => {
  const { MqttClient } = await import('../www/js/net/mqtt.js');
  const urls = ['wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
  for (const url of urls) {
    try {
      const a = new MqttClient({ url, clientId: 'rptest' + Date.now(), WebSocketImpl: WS });
      const b = new MqttClient({ url, clientId: 'rptest2' + Date.now(), WebSocketImpl: WS });
      await a.connect(); await b.connect();
      const got = new Promise(res => { b.onMessage = (t, p) => res({ t, p }); });
      b.subscribe('horizonsrp/test/#');
      await new Promise(r => setTimeout(r, 600));
      a.publish('horizonsrp/test/hello', JSON.stringify({ hi: 1 }));
      const r = await Promise.race([got, new Promise(res => setTimeout(() => res(null), 6000))]);
      console.log(url, '→', r ? 'OK ' + r.t + ' ' + r.p : 'нет сообщения');
      a.end(); b.end();
    } catch (e) {
      console.log(url, '→ ошибка:', e.message);
    }
  }
})();
