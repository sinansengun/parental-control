using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ParentalControl.Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddBrowserVisitIcon : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "IconBase64",
                table: "BrowserHistory",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IconBase64",
                table: "BrowserHistory");
        }
    }
}
