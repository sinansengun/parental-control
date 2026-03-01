using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ParentalControl.Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AppIcon",
                table: "WhatsAppMsgs",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AppName",
                table: "WhatsAppMsgs",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AppPackage",
                table: "WhatsAppMsgs",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "AppIcon",    table: "WhatsAppMsgs");
            migrationBuilder.DropColumn(name: "AppName",    table: "WhatsAppMsgs");
            migrationBuilder.DropColumn(name: "AppPackage", table: "WhatsAppMsgs");
        }
    }
}
