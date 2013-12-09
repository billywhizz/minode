require("./WebSocket");
var GoxClient = require("./mtgox").GoxClient;
var channels = {
  depth: "24e67e0d-1cad-4cc0-9e7a-f8523ef460fe",
  ticker: "d5f06780-30a8-4a48-a2f8-7ed181b4a13f",
  trade: "dbf1dee9-4f2e-4a08-8cb7-748919a71b21"
};
var gox = new GoxClient({lowlevel: true});
gox.connect(function() {
  gox.on("message", function(m) {
    switch(m.channel) {
      case channels.trade:
        if(m.trade.price_currency.toLowerCase() === "usd") {
          console.log({
            type: "trade",
            price: parseInt(m.trade.price_int),
            amount: parseInt(m.trade.amount_int)
          });
        }
        break;
      case channels.depth:
        if(m.depth.currency.toLowerCase() === "usd") {
          console.log({
            type: "depth",
            side: m.depth.type,
            price: parseInt(m.depth.price_int),
            vol: parseInt(m.depth.volume_int)
          });
        }
        break;
      case channels.ticker:
        if(m.channel_name.toLowerCase() === "ticker.btcusd") {
          console.log({
            type: "ticker",
            hi: parseInt(m.ticker.high.value_int),
            lo: parseInt(m.ticker.low.value_int),
            avg: parseInt(m.ticker.avg.value_int),
            last: parseInt(m.ticker.last.value_int),
            buy: parseInt(m.ticker.buy.value_int),
            sell: parseInt(m.ticker.sell.value_int),
            vol: parseInt(m.ticker.vol.value_int)
          });
        }
        break;
      default:
        console.error(m);
        break;
    }
  });
  gox.sendMessage({
    op: "unsubscribe",
    channel: channels.ticker
  });
  gox.sendMessage({
    op: "unsubscribe",
    channel: channels.trade
  });
  gox.sendMessage({
    op: "unsubscribe",
    channel: channels.depth
  });
  setTimeout(function() {
    gox.sendMessage({
      op: "mtgox.subscribe",
      type: "ticker"
    });
    gox.sendMessage({
      op: "mtgox.subscribe",
      type: "depth"
    });
    gox.sendMessage({
      op: "mtgox.subscribe",
      type: "trades"
    });
  }, 5000);
});
