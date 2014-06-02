////
// Tests for feeds
/////

var r = require('../../../build/packages/js/rethinkdb');
var assert = require('assert');

var port = parseInt(process.argv[2], 10);
var idValue = Math.floor(Math.random()*1000);

process.on('uncaughtException', function(err) {
    console.log(err);
    if (err.stack) {
        console.log(err.toString() + err.stack.toString());
    } else {
        console.log(err.toString());
    }
    process.exit(1)
});

var numWrites = 20;
setTimeout(function() {
    throw new Error("Timeout")
}, 60000);


function test1() {
    // Test insert, update, replace, delete and the basic case for `next`
    console.log("Running test1");
    r.connect({port:port}, function(err, conn) {
        if (err) throw err;

        r.table('test').changes().run(conn, function(err, feed) {
            if (err) throw err;

            var count = 0;
            var fn = function(err, data) {
                if (err) {
                    if ((count === 4) && (err.message.match(/^Changefeed aborted \(table unavailable/))) {
                        r.tableCreate('test').run(conn, function(err, result) {
                            if (err) throw err;
                            conn.close();
                            test2();
                        })
                    }
                    else {
                        throw err;
                    }

                }
                else {
                    if (count === 0) {
                        assert.equal(data.old_val, null);
                        assert.deepEqual(data.new_val, {id: idValue, value: 'insert'});
                    }
                    else if (count === 1) {
                        assert.deepEqual(data.old_val, {id: idValue, value: 'insert'});
                        assert.deepEqual(data.new_val, {id: idValue, value: 'update'});
                    }
                    else if (count === 2) {
                        assert.deepEqual(data.old_val, {id: idValue, value: 'update'});
                        assert.deepEqual(data.new_val, {id: idValue, value: 'replace'});
                    }
                    else if (count === 3) {
                        assert.deepEqual(data.old_val, {id: idValue, value: 'replace'});
                        assert.equal(data.new_val, null);
                    }
                    count++;
                    feed.next(fn);
                }
            }
            feed.next(fn);
        });
    
        setTimeout(function() { // Wait one seconds before doing the writes to be sure that the feed is opened
            r.connect({port: port}, function(err, conn) {
                r.table('test').insert({id: idValue, value: 'insert'}).run(conn).then(function() {
                    return r.table('test').get(idValue).update({value: 'update'}).run(conn);
                }).then(function() {
                    return r.table('test').get(idValue).replace({id: idValue, value: 'replace'}).run(conn);
                }).then(function() {
                    return r.table('test').get(idValue).delete().run(conn);
                }).then(function() {
                    return r.tableDrop('test').run(conn);
                }).error(function(err) {
                    throw err;
                });
            });
        }, 1000);

    });
}

function test2() {
    // Testing errors with `next`
    console.log("Running test2");
    r.connect({port:port}, function(err, conn) {
        if (err) throw err;

        r.table('test').changes().run(conn, function(err, feed) {
            if (err) throw err;

            var count = 0;
            feed.each(function(err, data) {
                if (err) {
                    if ((count === 4) && (err.message.match(/^Changefeed aborted \(table unavailable/))) {
                        // That's fine, the next step we'll be called by the onError callback
                    }
                    else {
                        throw err;
                    }
                }
                else {
                    if (count < 3) {
                        count++;
                    }
                    else {
                        throw new Error("Test shouldn't have enter this part of the code")
                    }
                }
            }, function() {
                r.tableCreate('test').run(conn, function(err, result) {
                    if (err) throw err;
                    test3();
                })
            });
        });
        setTimeout(function() { // Wait one seconds before doing the writes to be sure that the feed is opened
            r.connect({port: port}, function(err, conn) {
                r.table('test').insert({}).run(conn).then(function() {
                    return r.table('test').insert({}).run(conn);
                }).then(function() {
                    return r.table('test').insert({}).run(conn);
                }).then(function() {
                    return r.tableDrop('test').run(conn);
                }).error(function(err) {
                    throw err;
                });
            });
        }, 1000);
    });
}

function test3() {
    // Test that some methods are not available
    console.log("Running test3");
    
    r.connect({port:port}, function(err, conn) {
        if (err) throw err;

        r.table('test').changes().run(conn, function(err, feed) {
            if (err) throw err;
            assert.throws(function() {
                feed.hasNext();
            }, function(err) {
                if (err.message === "`hasNext` is not available for feeds.") {
                    return true;
                }
            });

            assert.throws(function() {
                feed.toArray();
            }, function(err) {
                if (err.message === "`toArray` is not available for feeds.") {
                    return true;
                }
            });
            conn.close();
            done();
        });
    });
}

function done() {
    console.log("Tests done.");
    process.exit(0);
}

test1();