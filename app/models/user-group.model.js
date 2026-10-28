"use strict";
module.exports=(sequelize,DataTypes)=>sequelize.define("userGroup",{
 userId:{type:DataTypes.INTEGER,allowNull:false,primaryKey:true,field:"user_id"},
 groupId:{type:DataTypes.INTEGER,allowNull:false,primaryKey:true,field:"group_id"},
 assignedAt:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:"assigned_at"}
},{tableName:"user_groups",timestamps:false});
