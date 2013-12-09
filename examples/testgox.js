require("./WebSocket");
var GoxClient = require("./gox").GoxClient;
var channels = {
  depth: "24e67e0d-1cad-4cc0-9e7a-f8523ef460fe",
  ticker: "d5f06780-30a8-4a48-a2f8-7ed181b4a13f",
  trade: "dbf1dee9-4f2e-4a08-8cb7-748919a71b21"
};
var gox = new GoxClient({lowlevel: true});
gox.connect(function() {
  gox.on('message', function(m) {
    switch(m.channel) {
      case channels.trade:
        if(m.trade.price_currency == "USD") {
          console.log({
            type: "trade",
            price: parseInt(m.trade.price_int),
            amount: parseInt(m.trade.amount_int)
          });
        }
        break;
      case channels.depth:
        if(m.depth.currency == "USD") {
          console.log({
            type: "depth",
            side: m.depth.type,
            price: parseInt(m.depth.price_int),
            vol: parseInt(m.depth.volume_int)
          });
        }
        break;
    }
  });
  gox.sendMessage({
    op: "unsubscribe",
    channel: channels.trade
  });
  gox.sendMessage({
    op: "unsubscribe",
    channel: channels.ticker
  });
  gox.sendMessage({
    op: "unsubscribe",
    channel: channels.depth
  });
});