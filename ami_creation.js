let aws = require('aws-sdk');
aws.config.update({region: 'ap-southeast-1'});
let ec2 = new aws.EC2();

exports.handler = async function(event, context, callback) {

    const param = {
	    Filters: [
            {
            Name: 'instance-state-name',
            Values: ['running']
            },
            {
            Name: 'tag:snapshot',
            Values: ['y']
            },
            {
            Name: 'tag:group',
            Values: ['spacecode']
            },
        ]
    };
    const image_key = ['group', 'service', 'retentionDays', 'Name'];
    const tag_to_key = ['Name', 'retentionDays'];
	
    let instance_list = await describe_instances(param, image_key, tag_to_key);
    instance_list = await create_image_loop(instance_list);
	await tag_images_loop(instance_list);
	
    console.log(instance_list);
	
};

function describe_instances(param, image_key, tag_to_key) { 
    return new Promise(function(resolve, reject) {
        ec2.describeInstances(param, function(err, data) {
            if(err) {
                reject('Error : ' + err + err.stack);
            } else {
                let instance_list = [];
                let items = data.Reservations;
                for(let item in items) {
                    let instances = items[item].Instances;
                    for(let instance in instances) {
                        let instance_id = instances[instance].InstanceId;
                        // Loop through all Tags and select only wanted key
                        let tags = instances[instance].Tags;
                        let tagged_key = [];
                        let tag_to_key_dict = {};
                        for(let tag in tags) {
                            if(tag_to_key.includes(tags[tag].Key)) {
                                tag_to_key_dict[tags[tag].Key] = tags[tag].Value;
                            }
                            if(image_key.includes(tags[tag].Key)) {
                                tagged_key.push(tags[tag])
                            }
                        }
                        let instance_des = {
                            'instance_id' : instance_id,
                            'tag' : tagged_key,
                        };
                        let instance_full_des = Object.assign({}, tag_to_key_dict, instance_des);
                        instance_list.push(instance_full_des);
                    }
                }
                resolve(instance_list);
            }
        });
    });
}

function create_image(inst, image_params) {
    return new Promise(function(resolve, reject) {
        ec2.createImage(image_params, function(err, data) {
            if(err) {
                reject('Error : ' + err + err.stack);
            } else {
				let ami_id = {
					'ami_id' : data.ImageId,
				};
				let instance_full_des = Object.assign({}, inst, ami_id);
                resolve(instance_full_des);
            }
        });
    });
}

function create_image_loop(instance_list) { 
	return new Promise(function(resolve, reject) {
		let instance_full_des_list = [];
		for(let instance in instance_list) {
			let inst = instance_list[instance];
			let image_params = {
				InstanceId: inst.instance_id,
				Name:  inst.Name + '_' + create_timestamp(),
			};
			instance_full_des_list.push(create_image(inst, image_params));
		};
		Promise.all(instance_full_des_list)
			.then(function(results){
				resolve(results);
			})
			.catch(function(e){
				reject('Error : ' + e + e.stack);
			});
    });
}

function tag_image(tag_params){
    return new Promise(function(resolve, reject) {
        ec2.createTags(tag_params, function(err, data) {
            if(err) {
                reject('Error : ' + err + err.stack);
            } else {
				resolve(data);
            }
        });
    });
}

function tag_images_loop(instance_list) {
    return new Promise(function(resolve, reject) {
        let promise = [];
        for(let instance in instance_list) {
            let inst = instance_list[instance];
            let delete_milliseconds_dict = { 
                Key: 'deleteDate', 
                Value: cal_delete_date(inst.retentionDays).toString()
            };
            inst.tag.push(delete_milliseconds_dict);
            let tag_params = {
                Resources: [inst.ami_id],
                Tags: inst.tag
            };
			promise.push(tag_image(tag_params));
        }
		Promise.all(promise)
			.then(function(results){
				resolve(results);
			})
			.catch(function(e){
				reject('Error : ' + e + e.stack);
			});
    });
}

function create_timestamp() {
    let now = new Date();
    let date_stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
    let time_stamp = now.toISOString().slice(11, 19).replace(/:/g, "");
    let milli_stamp = now.toISOString().slice(20, 24);
    let timestamp = date_stamp + '-' + time_stamp + '-' + milli_stamp;
    return timestamp;
}

function cal_delete_date(retention_days) {
	let date = new Date();
	date.setDate(date.getDate() + Number(retention_days));
    let date_stamp = date.toISOString().slice(0, 10).replace(/-/g, "");
	return date_stamp;
}
