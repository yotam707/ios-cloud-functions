const functions = require('firebase-functions');

const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);


// Take the text parameter passed to this HTTP endpoint and insert it into the
// Realtime Database under the path /messages/:pushId/original
exports.addMessage = functions.https.onRequest((req, res) => {
    // Grab the text parameter.
    const original = req.query.text;
    // Push the new message into the Realtime Database using the Firebase Admin SDK.
    admin.database().ref('/messages').push({original: original}).then(snapshot => {
      // Redirect with 303 SEE OTHER to the URL of the pushed object in the Firebase console.
      res.redirect(303, snapshot.ref);
    });
  });


  exports.makeUppercase = functions.database.ref('/messages/{pushId}/original')
  .onWrite(event => {
    const original = event.data.val();
    console.log("UpperCasing", event.params.pushId, original);
    const uppercase = original.toUpperCase();
    return event.data.ref.parent.child('uppercase').set(uppercase);
  });


  
//here we will add the push notifications to all the relevant professionals once the apn works. 
// exports.onOrderRequestReceived = functions.database.ref('/OrdersPros/{orderRequestId}')
// .onWrite(event => {
//     const snapshot = event.data;
    
// });

exports.incomingOrderRequest = functions.database.ref('/OrderRequest/Users/{userId}/{orderRequestId}')
.onWrite(event => {
    console.log(event.params);
    const snapshot = event.data;
    const uid = event.params.orderRequestId;
    let availablePros = [];
    let OrderReqPros =[];
    if(snapshot.previous.val())
        return;
    const OrderProsRef = event.data.ref.root.child('/OrdersPros/'+uid);

    event.data.ref.root.child('professionals').once('value').then(professionals => {
        if(professionals.val()){      
            professionals.val().forEach((pro, index)=> {
                console.log(pro)
                if(pro.active)
                    availablePros.push(pro.id);
            });
        }else{
            console.log("no professionals available");
        }
    }).then(()=>{
        if(availablePros.length <= 0){
            console.log("Available Pros array is empty")
            return;
        }
        availablePros.forEach((aPro, index)=> {
            OrderReqPros.push({
                proId: aPro,
                timestamp: new Date().toString()
            });
        });
        return OrderProsRef.set(OrderReqPros);
    });
});

  exports.incomingOrderRequestNotification = functions.database.ref('/OrderRequest/Users/{userId}/{orderRequestId}')
  .onWrite(event => {
        const snapshot = event.data;
        if(snapshot.previous.val())
            return;
        //Notification details
        const text = snapshot.val().text;
        const payLoad = {
            notification: {
                title:`${snapshot.val().name} posted ${text ? 'a message': 'an image'}`,
                body: text ? (text.length <= 100 ? text : text.substring(0, 97) + '...') : '',
                click_action: `https://${functions.config().firebase.authDomain}`
            }
        };

        return admin.database().ref('fcmTokens').once('value').then(allTokens => {
            if(allTokens.val()){
                const tokens = Object.keys(allTokens.val());
                return admin.messaging().sendToDevice(tokens,payLoad).then(response => {
                    const tokensToRemove = [];
                    response.results.forEach((result, index)=> {
                        const error = result.error;
                        if(error){
                            console.error('Failure sending notification to', tokens[index], error);
                            if (error.code === 'messaging/invalid-registration-token' ||
                                error.code === 'messaging/registration-token-not-registered') {
                              tokensToRemove.push(allTokens.ref.child(tokens[index]).remove());
                            }
                        }
                    });
                    return Promise.all(tokensToRemove);
                });
            }
        });
  });
