# StatsD Bosun publisher backend

## Overview
This is a pluggable backend for [StatsD](https://github.com/etsy/statsd), which publishes stats to OpenTSDB (http://opentsdb.net). It is based off [statsd-opentsdb-backend](https://github.com/danslimmon/statsd-opentsdb-backend).

## Installation

    npm install statsd-bosun-backend

## Configuration
You have to give basic information about your Bosun or tsdbrelay server to use
```
{ bosunHost: 'localhost'
, bosunPort: 4242
, bosunTagPrefix: '_t_'
}
```

## Tag support
This backend allows you to attach tags to your metrics. To add a counter
called `gorets` and tag the data `foo=bar`, you'd write the following to statsd:

    gorets._t_foo.bar:261|c

## Dependencies
- none

## Issues
- [Issues](https://github.com/TrentScholl/statsd-bosun-backend/issues)